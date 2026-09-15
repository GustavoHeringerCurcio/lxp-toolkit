import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { assist, raw } from "./paths.js";
import { closePool, healthCheck, query, runMigrations, withTransaction } from "./db.js";
import { loadAiConfig, loadAnswers, loadOverrides, loadProfile, loadSubmissions } from "./config.js";
import { stripHtml } from "./build.js";
import {
  matchProfessor,
  professorFromModuleTitle,
  teachersFromContext,
  toDisplayName,
  type Teacher,
} from "./professor.js";

interface RawAttachment {
  url: string;
  filename: string | null;
  filesize: number | null;
}

interface RawQuestion {
  id: number;
  questionTypeId?: number;
  enunciated?: string;
  options?: { id: number; text?: string }[];
}

interface RawItem {
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  sectionId: number | null;
  sectionTitle: string | null;
  itemId: number;
  itemTitle: string;
  topicTypeId: number;
  categoryTypeId: number | null;
  progressTypeId: number;
  progressId: number | null;
  viewed: boolean;
  grade: unknown;
  isRecordProgress: boolean;
  expired: boolean;
  hasCompletedAllAttempts: boolean | null;
  hasDeadline: boolean;
  deadlineAt: string | null;
  kind: string;
  done: boolean;
  attachments: RawAttachment[];
  html: string | null;
  content: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  studentGrade: unknown;
}

interface RawCourse {
  courseId: number;
  courseName: string;
  items: RawItem[];
}

const DEFAULT_HOST = process.env.LXP_HOST ?? "unifoa2.grupoa.education";

function parseExternalId(courseName: string): string | null {
  const m = courseName.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

function termFromExternalId(externalId: string | null): string | null {
  if (!externalId) return null;
  const m = externalId.match(/_(\d{4})_(\d+)$/);
  return m ? `${m[1]}.${m[2]}` : null;
}

function text(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * Parse a portal deadline ("YYYY-MM-DD HH:MM:SS", a local wall-clock time) into
 * a Date. Using one parser everywhere keeps stored timestamps and the change
 * detection in `item_state` consistent (and therefore idempotent).
 */
function parsePortalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function contentHash(item: RawItem): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: item.itemTitle,
        html: item.html ?? "",
        deadlineAt: item.deadlineAt ?? null,
        content: item.content ?? null,
        attachments: item.attachments ?? [],
      }),
    )
    .digest("hex");
}

async function ensureInstitution(): Promise<number> {
  const rows = await query<{ id: string }>("SELECT id FROM institution ORDER BY id LIMIT 1");
  if (rows.length > 0) return Number(rows[0].id);
  const inserted = await query<{ id: string }>(
    "INSERT INTO institution(name, host) VALUES ($1, $2) RETURNING id",
    ["UniFOA", DEFAULT_HOST],
  );
  return Number(inserted[0].id);
}

async function ensureStudent(institutionId: number): Promise<number> {
  const existing = await query<{ id: string }>("SELECT id FROM student ORDER BY id LIMIT 1");
  if (existing.length > 0) {
    // Postgres owns the profile now: never overwrite it from the legacy JSON.
    const id = Number(existing[0].id);
    await query("UPDATE student SET institution_id = $2, updated_at = now() WHERE id = $1", [
      id,
      institutionId,
    ]);
    return id;
  }
  const profile = loadProfile();
  const inserted = await query<{ id: string }>(
    "INSERT INTO student(institution_id, name, matricula) VALUES ($1, $2, $3) RETURNING id",
    [institutionId, profile.nome || null, profile.matricula || null],
  );
  return Number(inserted[0].id);
}

async function upsertProfessors(client: PoolClient, teachers: Teacher[]): Promise<void> {
  for (const t of teachers) {
    const display = toDisplayName(t.name);
    await client.query(
      `INSERT INTO professor(safea_user_id, user_id, external_user_id, full_name, display_name, slug, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (safea_user_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         external_user_id = EXCLUDED.external_user_id,
         full_name = EXCLUDED.full_name,
         display_name = EXCLUDED.display_name,
         slug = EXCLUDED.slug,
         updated_at = now()`,
      [
        t.safeaUserId,
        t.userId,
        t.externalUserId,
        t.name,
        display,
        display.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      ],
    );
  }
}

async function importCourse(client: PoolClient, course: RawCourse, studentId: number): Promise<number> {
  const externalId = parseExternalId(course.courseName);
  await client.query(
    `INSERT INTO course(id, external_id, name, term, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (id) DO UPDATE SET
       external_id = EXCLUDED.external_id,
       name = EXCLUDED.name,
       term = EXCLUDED.term,
       updated_at = now()`,
    [course.courseId, externalId, course.courseName, termFromExternalId(externalId)],
  );

  // Teachers are course-wide; collect the union across items.
  const teachersById = new Map<number, Teacher>();
  for (const item of course.items) {
    for (const t of teachersFromContext(item.context)) teachersById.set(t.safeaUserId, t);
  }
  const teachers = [...teachersById.values()];
  await upsertProfessors(client, teachers);

  // Enrollment (portal enrollment id lives on the item context).
  const enrollmentId = course.items
    .map((it) => Number(it.context?.enrollmentId))
    .find((n) => Number.isFinite(n) && n > 0);
  const firstAccessAt = course.items
    .map((it) => (it.context?.firstAccessAt != null ? String(it.context.firstAccessAt) : null))
    .find((v): v is string => !!v);
  if (enrollmentId) {
    await client.query(
      `INSERT INTO enrollment(student_id, course_id, portal_enrollment_id, first_access_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (student_id, course_id) DO UPDATE SET
         portal_enrollment_id = EXCLUDED.portal_enrollment_id,
         first_access_at = COALESCE(EXCLUDED.first_access_at, enrollment.first_access_at)`,
      [studentId, course.courseId, enrollmentId, firstAccessAt],
    );
  }

  // Modules + the stable module→professor link.
  const modules = new Map<number, string>();
  for (const item of course.items) modules.set(item.moduleId, item.moduleTitle);
  for (const [moduleId, title] of modules) {
    const { name } = splitTitle(title);
    await client.query(
      `INSERT INTO module(id, course_id, title, name, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         title = EXCLUDED.title,
         name = EXCLUDED.name,
         updated_at = now()`,
      [moduleId, course.courseId, title, name],
    );
    const suffix = professorFromModuleTitle(title);
    const match = matchProfessor(suffix, teachers);
    if (match.professorId != null) {
      await client.query(
        `INSERT INTO module_professor(module_id, professor_id, source, confidence)
         VALUES ($1,$2,'title_parse',$3)
         ON CONFLICT (module_id, professor_id) DO UPDATE SET
           source = EXCLUDED.source,
           confidence = EXCLUDED.confidence`,
        [moduleId, match.professorId, match.confidence],
      );
    }
  }

  // Sections.
  const sections = new Map<number, { moduleId: number; title: string }>();
  for (const item of course.items) {
    if (item.sectionId != null && item.sectionTitle) {
      sections.set(item.sectionId, { moduleId: item.moduleId, title: item.sectionTitle });
    }
  }
  for (const [sectionId, s] of sections) {
    await client.query(
      `INSERT INTO section(id, module_id, title)
       VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET
         module_id = EXCLUDED.module_id,
         title = EXCLUDED.title`,
      [sectionId, s.moduleId, s.title],
    );
  }

  // Content items + attachments + question bank.
  for (const item of course.items) {
    await client.query(
      `INSERT INTO content_item(
         id, course_id, module_id, section_id, enrollment_id, topic_type_id, category_type_id,
         progress_type_id, kind, title, is_record_progress, has_deadline, deadline_at, expired,
         html, content_hash, raw_json, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         module_id = EXCLUDED.module_id,
         section_id = EXCLUDED.section_id,
         enrollment_id = EXCLUDED.enrollment_id,
         topic_type_id = EXCLUDED.topic_type_id,
         category_type_id = EXCLUDED.category_type_id,
         progress_type_id = EXCLUDED.progress_type_id,
         kind = EXCLUDED.kind,
         title = EXCLUDED.title,
         is_record_progress = EXCLUDED.is_record_progress,
         has_deadline = EXCLUDED.has_deadline,
         deadline_at = EXCLUDED.deadline_at,
         expired = EXCLUDED.expired,
         html = EXCLUDED.html,
         content_hash = EXCLUDED.content_hash,
         raw_json = EXCLUDED.raw_json,
         updated_at = now()`,
      [
        item.itemId,
        course.courseId,
        item.moduleId,
        item.sectionId,
        enrollmentId ?? null,
        item.topicTypeId,
        item.categoryTypeId,
        item.progressTypeId,
        item.kind,
        item.itemTitle,
        item.isRecordProgress === true,
        item.hasDeadline === true,
        parsePortalDate(item.deadlineAt),
        item.expired === true,
        item.html,
        contentHash(item),
        JSON.stringify(item),
      ],
    );

    await client.query("DELETE FROM attachment WHERE content_item_id = $1", [item.itemId]);
    for (const a of item.attachments ?? []) {
      await client.query(
        `INSERT INTO attachment(content_item_id, url, filename, filesize)
         VALUES ($1,$2,$3,$4)`,
        [item.itemId, a.url, a.filename, a.filesize],
      );
    }

    const questions = Array.isArray(item.content?.questions) ? (item.content?.questions as RawQuestion[]) : [];
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      const qText = stripHtml(String(q.enunciated ?? ""));
      await client.query(
        `INSERT INTO question(id, content_item_id, question_type_id, text, position, text_hash)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           content_item_id = EXCLUDED.content_item_id,
           question_type_id = EXCLUDED.question_type_id,
           text = EXCLUDED.text,
           position = EXCLUDED.position,
           text_hash = EXCLUDED.text_hash`,
        [
          Number(q.id),
          item.itemId,
          q.questionTypeId != null ? Number(q.questionTypeId) : null,
          qText,
          qi,
          createHash("sha256").update(qText).digest("hex"),
        ],
      );
      const options = Array.isArray(q.options) ? q.options : [];
      for (let oi = 0; oi < options.length; oi++) {
        const o = options[oi];
        await client.query(
          `INSERT INTO question_option(id, question_id, position, text)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET
             question_id = EXCLUDED.question_id,
             position = EXCLUDED.position,
             text = EXCLUDED.text`,
          [Number(o.id), Number(q.id), oi, stripHtml(String(o.text ?? ""))],
        );
      }
    }

    await appendStateIfChanged(client, item, studentId);
  }

  return course.items.length;
}

/** Split "Banco de Dados I - Profa. Débora Amorim" into { name, professor }. */
function splitTitle(moduleTitle: string): { name: string; professor: string | null } {
  const m = moduleTitle.match(/^(.*?)\s+-\s+(Profa?\.\s*.*)$/i);
  if (m) return { name: m[1].trim(), professor: m[2].trim() };
  return { name: moduleTitle.trim(), professor: null };
}

/** Append an `item_state` snapshot only when it differs from the latest one. */
async function appendStateIfChanged(client: PoolClient, item: RawItem, studentId: number): Promise<void> {
  const latest = await client.query<{
    done: boolean;
    viewed: boolean;
    grade: string | null;
    student_grade: string | null;
    status: string | null;
    deadline_at: Date | null;
    has_completed_all_attempts: boolean | null;
    progress_id: string | null;
  }>(
    `SELECT done, viewed, grade, student_grade, status, deadline_at,
            has_completed_all_attempts, progress_id
     FROM item_state WHERE content_item_id = $1 ORDER BY captured_at DESC LIMIT 1`,
    [item.itemId],
  );

  const next = {
    done: item.done === true,
    viewed: item.viewed === true,
    grade: text(item.grade),
    studentGrade: text(item.studentGrade),
    deadlineAt: parsePortalDate(item.deadlineAt),
    hasCompletedAllAttempts: item.hasCompletedAllAttempts,
    progressId: item.progressId,
  };

  const prev = latest.rows[0];
  const same =
    prev &&
    prev.done === next.done &&
    prev.viewed === next.viewed &&
    prev.grade === next.grade &&
    prev.student_grade === next.studentGrade &&
    prev.has_completed_all_attempts === next.hasCompletedAllAttempts &&
    String(prev.progress_id ?? "") === String(next.progressId ?? "") &&
    (prev.deadline_at ? prev.deadline_at.toISOString() : null) ===
      (next.deadlineAt ? next.deadlineAt.toISOString() : null);
  if (same) return;

  await client.query(
    `INSERT INTO item_state(
       content_item_id, student_id, done, viewed, grade, student_grade, status,
       deadline_at, has_completed_all_attempts, progress_id, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'import')`,
    [
      item.itemId,
      studentId,
      next.done,
      next.viewed,
      next.grade,
      next.studentGrade,
      null,
      next.deadlineAt,
      next.hasCompletedAllAttempts,
      next.progressId,
    ],
  );
}

// ── Legacy JSON backfill ────────────────────────────────────────────────────

/**
 * Reconcile the legacy `answers.json` into Postgres. Idempotent: attempts are
 * matched by (item, content, created_at) so a re-run inserts nothing new; the
 * version the JSON marks as current becomes `is_current`.
 */
async function backfillAnswers(studentId: number): Promise<number> {
  const answers = loadAnswers();
  let imported = 0;
  for (const [key, rec] of Object.entries(answers)) {
    const itemId = Number(key);
    if (!Number.isFinite(itemId)) continue;
    const exists = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM content_item WHERE id = $1",
      [itemId],
    );
    if (Number(exists[0]?.n ?? "0") === 0) continue;

    const versions = [
      ...(rec.history ?? []).map((h) => ({ ...h, current: false })),
      { answer: rec.answer, updatedAt: rec.updatedAt, source: rec.source, selections: rec.selections, current: true },
    ];

    let currentAttemptId: number | null = null;
    for (const v of versions) {
      const createdAt = v.updatedAt ? new Date(v.updatedAt) : new Date();
      const content = v.answer ?? "";
      const found = await query<{ id: string }>(
        `SELECT id FROM answer_attempt
         WHERE content_item_id = $1 AND student_id = $2 AND content = $3 AND created_at = $4
         ORDER BY id LIMIT 1`,
        [itemId, studentId, content, createdAt],
      );

      let attemptId: number;
      if (found[0]) {
        attemptId = Number(found[0].id);
      } else {
        const inserted = await query<{ id: string }>(
          `INSERT INTO answer_attempt(student_id, content_item_id, created_at, source, content, is_current)
           VALUES ($1,$2,$3,$4,$5,false) RETURNING id`,
          [studentId, itemId, createdAt, v.source === "manual" ? "manual" : "ai", content],
        );
        attemptId = Number(inserted[0].id);
        imported++;
        for (let i = 0; i < (v.selections ?? []).length; i++) {
          const s = v.selections![i];
          await query(
            `INSERT INTO answer_selection(answer_attempt_id, question_id, option_id, letter, position)
             VALUES ($1,$2,$3,$4,$5)`,
            [attemptId, s.questionId ?? null, s.optionId ?? null, s.letter ?? null, i],
          );
        }
      }
      if (v.current) currentAttemptId = attemptId;
    }

    if (currentAttemptId != null) {
      await query(
        `UPDATE answer_attempt SET is_current = (id = $3)
         WHERE content_item_id = $1 AND student_id = $2`,
        [itemId, studentId, currentAttemptId],
      );
    }
  }
  return imported;
}

async function backfillSubmissions(studentId: number): Promise<number> {
  const submissions = loadSubmissions();
  let imported = 0;
  for (const [key, entries] of Object.entries(submissions)) {
    const itemId = Number(key);
    if (!Number.isFinite(itemId) || !Array.isArray(entries)) continue;
    const exists = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM content_item WHERE id = $1",
      [itemId],
    );
    if (Number(exists[0]?.n ?? "0") === 0) continue;

    for (const e of entries) {
      const at = e.at ? new Date(e.at) : new Date();
      const found = await query<{ id: string }>(
        "SELECT id FROM submission WHERE content_item_id = $1 AND student_id = $2 AND at = $3 LIMIT 1",
        [itemId, studentId, at],
      );
      if (found[0]) continue;
      await query(
        `INSERT INTO submission(
           student_id, content_item_id, at, status, mode, attachment_name,
           attempt_number, detail, portal_detail, confirmation_at, answer)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          studentId,
          itemId,
          at,
          e.status,
          e.mode ?? null,
          e.attachmentName ?? null,
          e.attemptNumber ?? null,
          e.detail ?? null,
          e.portalDetail ?? null,
          e.confirmationAt ? new Date(e.confirmationAt) : null,
          e.answer ?? null,
        ],
      );
      imported++;
    }
  }
  return imported;
}

async function backfillOverrides(studentId: number): Promise<number> {
  const overrides = loadOverrides();
  let imported = 0;
  for (const [key, o] of Object.entries(overrides)) {
    const itemId = Number(key);
    if (!Number.isFinite(itemId)) continue;
    const exists = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM content_item WHERE id = $1",
      [itemId],
    );
    if (Number(exists[0]?.n ?? "0") === 0) continue;

    let aiRequest: unknown = null;
    if (typeof o.aiRequest === "string" && o.aiRequest.trim()) {
      try {
        aiRequest = JSON.parse(o.aiRequest);
      } catch {
        aiRequest = null;
      }
    }
    await query(
      `INSERT INTO item_annotation(
         content_item_id, student_id, notes, prompt_override, hidden, tag, manual_status, ai_request_json, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (content_item_id, student_id) DO UPDATE SET
         notes = EXCLUDED.notes,
         prompt_override = EXCLUDED.prompt_override,
         hidden = EXCLUDED.hidden,
         tag = EXCLUDED.tag,
         manual_status = EXCLUDED.manual_status,
         ai_request_json = EXCLUDED.ai_request_json,
         updated_at = now()`,
      [
        itemId,
        studentId,
        o.notes ?? null,
        o.promptOverride ?? null,
        o.hide === true,
        o.tag ?? null,
        o.manualStatus ?? null,
        aiRequest,
      ],
    );
    imported++;
  }
  return imported;
}

async function importAiConfig(studentId: number): Promise<void> {
  // Postgres is the source of truth: only seed from the legacy JSON file when
  // the row is absent, so runtime edits are never clobbered by an index run.
  const existing = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM ai_config WHERE student_id = $1",
    [studentId],
  );
  if (Number(existing[0]?.n ?? "0") > 0) return;
  const cfg = loadAiConfig();
  await query(
    `INSERT INTO ai_config(student_id, provider, model, temperature, max_output_tokens, style_json, sections_json, project_auto_detect, models_json, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
    [
      studentId,
      cfg.provider,
      cfg.models?.generation ?? cfg.model,
      cfg.temperature ?? null,
      cfg.max_output_tokens ?? null,
      JSON.stringify(cfg.style ?? {}),
      JSON.stringify(cfg.activitySections ?? {}),
      cfg.projectAutoDetect ?? true,
      JSON.stringify(cfg.models ?? {}),
    ],
  );
}

export interface ImportSummary {
  courses: number;
  items: number;
  professors: number;
  answers: number;
  submissions: number;
  annotations: number;
}

/** Import the scraped content tree + legacy JSON state into Postgres. */
export async function importAll(): Promise<ImportSummary> {
  const file = raw("content-tree.json");
  if (!existsSync(file)) {
    throw new Error(`Missing ${file}. Run 'npm run dump' at the repo root first.`);
  }
  const courses = JSON.parse(readFileSync(file, "utf-8")) as RawCourse[];

  await healthCheck();
  await runMigrations();

  const institutionId = await ensureInstitution();
  const studentId = await ensureStudent(institutionId);

  let items = 0;
  for (const course of courses) {
    // Ignore synthetic "gradebook-only" rows left by older scrapes: the portal
    // never assigns negative ids, so those are the removed reconciliation items
    // (grouped under phantom modules). This keeps re-imports of a stale
    // content-tree.json from resurrecting them.
    const clean: RawCourse = {
      ...course,
      items: course.items.filter((it) => it.itemId >= 0 && it.moduleId >= 0),
    };
    await withTransaction(async (client) => {
      items += await importCourse(client, clean, studentId);
    });
  }

  const answers = await backfillAnswers(studentId);
  const submissions = await backfillSubmissions(studentId);
  const annotations = await backfillOverrides(studentId);
  await importAiConfig(studentId);

  const profs = await query<{ n: string }>("SELECT count(*)::text AS n FROM professor");
  return {
    courses: courses.length,
    items,
    professors: Number(profs[0]?.n ?? "0"),
    answers,
    submissions,
    annotations,
  };
}

async function main(): Promise<void> {
  const summary = await importAll();
  console.log(
    `db: import ok — courses=${summary.courses} items=${summary.items} professors=${summary.professors} ` +
      `answers=${summary.answers} submissions=${summary.submissions} annotations=${summary.annotations}`,
  );
  const file = assist("data", "exercises.json");
  console.log(`   next: npm run index:web (projects the DB to ${file})`);
}

const invokedDirectly = process.argv[1] ? import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")) : false;
if (invokedDirectly) {
  main()
    .catch((err) => {
      console.error(`db: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

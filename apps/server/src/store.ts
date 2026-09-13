/**
 * Runtime Postgres store — the source of truth for student activity.
 *
 * Answers, submissions, overrides, profile, AI config and AI runs are written
 * here at request time. `config.ts` is now only the legacy JSON reader used by
 * the one-time import (`import.ts`); nothing here reads or writes those files.
 */
import { query, withTransaction } from "./db.js";
import { linkedinAvatarUrl } from "./linkedin.js";
import { DEFAULT_ACTIVITY_SECTIONS, DEFAULT_STYLE, loadAiConfig, loadProfile } from "./config.js";
import type {
  AiConfig,
  AiProfile,
  AnswerRecord,
  AnswerSource,
  Answers,
  ExerciseStatus,
  Overrides,
  OverridesEntry,
  ProfessorLink,
  QuizSelection,
  SubmissionEntry,
  Submissions,
} from "./types.js";

const MAX_HISTORY = 20;

function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

/** The single local student row (created from the legacy profile when absent). */
export async function getStudentId(): Promise<number> {
  const rows = await query<{ id: string }>("SELECT id FROM student ORDER BY id LIMIT 1");
  if (rows.length > 0) return Number(rows[0].id);
  const p = loadProfile();
  const inserted = await query<{ id: string }>(
    "INSERT INTO student(name, matricula) VALUES ($1,$2) RETURNING id",
    [p.nome || null, p.matricula || null],
  );
  return Number(inserted[0].id);
}

export async function getProfile(): Promise<AiProfile> {
  const rows = await query<{ name: string | null; matricula: string | null }>(
    "SELECT name, matricula FROM student ORDER BY id LIMIT 1",
  );
  const row = rows[0];
  if (!row) return loadProfile();
  return { nome: row.name ?? "", matricula: row.matricula ?? "" };
}

export async function saveProfile(profile: AiProfile): Promise<void> {
  const id = await getStudentId();
  await query("UPDATE student SET name = $2, matricula = $3, updated_at = now() WHERE id = $1", [
    id,
    profile.nome,
    profile.matricula,
  ]);
}

// ── Professor photos (per student) ──────────────────────────────────────────

interface ProfessorLinkRow {
  professor_id: string;
  linkedin_url: string | null;
  image_url: string | null;
  source: string;
  updated_at: Date;
}

function toProfessorLink(r: ProfessorLinkRow): ProfessorLink {
  return {
    professorId: Number(r.professor_id),
    linkedinUrl: r.linkedin_url,
    imageUrl: r.image_url,
    source: r.source === "manual" ? "manual" : "linkedin",
    updatedAt: iso(r.updated_at),
    // A manual image URL wins; otherwise the browser loads unavatar directly.
    photoUrl: r.image_url || linkedinAvatarUrl(r.linkedin_url) || "",
  };
}

const PROFESSOR_LINK_COLS = "professor_id, linkedin_url, image_url, source, updated_at";

export async function getProfessorLinks(): Promise<ProfessorLink[]> {
  const studentId = await getStudentId();
  const rows = await query<ProfessorLinkRow>(
    `SELECT ${PROFESSOR_LINK_COLS} FROM professor_link WHERE student_id = $1`,
    [studentId],
  );
  return rows.map(toProfessorLink);
}

export async function getProfessorLink(professorId: number): Promise<ProfessorLink | null> {
  const studentId = await getStudentId();
  const rows = await query<ProfessorLinkRow>(
    `SELECT ${PROFESSOR_LINK_COLS} FROM professor_link WHERE student_id = $1 AND professor_id = $2`,
    [studentId, professorId],
  );
  return rows[0] ? toProfessorLink(rows[0]) : null;
}

export async function saveProfessorLink(
  professorId: number,
  input: { linkedinUrl?: string | null; imageUrl?: string | null },
): Promise<ProfessorLink> {
  const studentId = await getStudentId();
  const linkedinUrl = (input.linkedinUrl ?? "").trim() || null;
  const imageUrl = (input.imageUrl ?? "").trim() || null;
  const source = imageUrl ? "manual" : "linkedin";
  await query(
    `INSERT INTO professor_link(student_id, professor_id, linkedin_url, image_url, source, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (student_id, professor_id) DO UPDATE SET
       linkedin_url = EXCLUDED.linkedin_url,
       image_url = EXCLUDED.image_url,
       source = EXCLUDED.source,
       updated_at = now()`,
    [studentId, professorId, linkedinUrl, imageUrl, source],
  );
  const link = await getProfessorLink(professorId);
  if (!link) throw new Error(`falha ao salvar foto do professor ${professorId}`);
  return link;
}

export async function deleteProfessorLink(professorId: number): Promise<void> {
  const studentId = await getStudentId();
  await query("DELETE FROM professor_link WHERE student_id = $1 AND professor_id = $2", [
    studentId,
    professorId,
  ]);
}

// ── Answers (immutable attempts; one is_current per item) ────────────────────

interface AttemptRow {
  id: string;
  content_item_id: string;
  created_at: Date;
  source: string;
  content: string;
  is_current: boolean;
}

interface SelectionRow {
  answer_attempt_id: string;
  question_id: string | null;
  option_id: string | null;
  letter: string | null;
  option_index: number | null;
}

function toSelections(rows: SelectionRow[]): QuizSelection[] {
  return rows.map((s) => ({
    questionId: s.question_id != null ? Number(s.question_id) : 0,
    optionIndex: s.option_index != null ? Number(s.option_index) : 0,
    letter: s.letter ?? "",
    optionId: s.option_id != null ? Number(s.option_id) : 0,
  }));
}

export async function getAnswers(): Promise<Answers> {
  const studentId = await getStudentId();
  const [attempts, selections] = await Promise.all([
    query<AttemptRow>(
      `SELECT id, content_item_id, created_at, source, content, is_current
       FROM answer_attempt WHERE student_id = $1 ORDER BY created_at`,
      [studentId],
    ),
    query<SelectionRow>(
      `SELECT s.answer_attempt_id, s.question_id, s.option_id, s.letter, qo.position AS option_index
       FROM answer_selection s
       JOIN answer_attempt a ON a.id = s.answer_attempt_id
       LEFT JOIN question_option qo ON qo.id = s.option_id
       WHERE a.student_id = $1
       ORDER BY s.answer_attempt_id, s.position`,
      [studentId],
    ),
  ]);

  const byAttempt = new Map<number, SelectionRow[]>();
  for (const s of selections) {
    const list = byAttempt.get(Number(s.answer_attempt_id)) ?? [];
    list.push(s);
    byAttempt.set(Number(s.answer_attempt_id), list);
  }

  const byItem = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const key = String(a.content_item_id);
    const list = byItem.get(key) ?? [];
    list.push(a);
    byItem.set(key, list);
  }

  const out: Answers = {};
  for (const [key, list] of byItem) {
    const current = list.find((a) => a.is_current) ?? list[list.length - 1];
    const entry = (a: AttemptRow) => ({
      answer: a.content,
      updatedAt: iso(a.created_at),
      source: (a.source === "manual" ? "manual" : "ai") as AnswerSource,
      selections: toSelections(byAttempt.get(Number(a.id)) ?? []),
    });
    out[key] = { ...entry(current), history: list.filter((a) => a !== current).map(entry) };
  }
  return out;
}

export async function getAnswerRecord(id: number | string): Promise<AnswerRecord | null> {
  return (await getAnswers())[String(id)] ?? null;
}

export async function getCurrentAttemptId(id: number | string): Promise<number | null> {
  const studentId = await getStudentId();
  const rows = await query<{ id: string }>(
    "SELECT id FROM answer_attempt WHERE content_item_id = $1 AND student_id = $2 AND is_current LIMIT 1",
    [Number(id), studentId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function saveAnswerVersion(
  id: number | string,
  answer: string,
  source: AnswerSource,
  updatedAt?: string,
  selections: QuizSelection[] = [],
  meta: { model?: string | null; promptHash?: string | null } = {},
): Promise<AnswerRecord> {
  const itemId = Number(id);
  const studentId = await getStudentId();
  const at = updatedAt ? new Date(updatedAt) : new Date();
  const model = meta.model ?? null;
  const promptHash = meta.promptHash ?? null;

  await withTransaction(async (client) => {
    const cur = await client.query<{ id: string; content: string }>(
      "SELECT id, content FROM answer_attempt WHERE content_item_id = $1 AND student_id = $2 AND is_current LIMIT 1",
      [itemId, studentId],
    );
    const prev = cur.rows[0];

    if (prev) {
      const prevSel = await client.query<SelectionRow>(
        `SELECT s.answer_attempt_id, s.question_id, s.option_id, s.letter, qo.position AS option_index
         FROM answer_selection s LEFT JOIN question_option qo ON qo.id = s.option_id
         WHERE s.answer_attempt_id = $1 ORDER BY s.position`,
        [prev.id],
      );
      const same =
        prev.content === answer &&
        JSON.stringify(toSelections(prevSel.rows)) === JSON.stringify(selections);
      if (same) {
        await client.query(
          "UPDATE answer_attempt SET created_at = $2, source = $3, model = $4, prompt_hash = $5 WHERE id = $1",
          [prev.id, at, source, model, promptHash],
        );
        return;
      }
      await client.query("UPDATE answer_attempt SET is_current = false WHERE id = $1", [prev.id]);
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO answer_attempt(student_id, content_item_id, created_at, source, content, model, prompt_hash, is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
      [studentId, itemId, at, source, answer, model, promptHash],
    );
    const attemptId = Number(inserted.rows[0].id);
    for (let i = 0; i < selections.length; i++) {
      const s = selections[i];
      await client.query(
        `INSERT INTO answer_selection(answer_attempt_id, question_id, option_id, letter, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [attemptId, s.questionId || null, s.optionId || null, s.letter ?? null, i],
      );
    }

    // Keep only the newest MAX_HISTORY non-current attempts.
    await client.query(
      `DELETE FROM answer_attempt WHERE id IN (
         SELECT id FROM answer_attempt
         WHERE content_item_id = $1 AND student_id = $2 AND is_current = false
         ORDER BY created_at DESC OFFSET $3
       )`,
      [itemId, studentId, MAX_HISTORY],
    );
  });

  const rec = await getAnswerRecord(itemId);
  if (!rec) throw new Error(`falha ao salvar resposta ${itemId}`);
  return rec;
}

export async function restoreAnswerVersion(id: number | string, index: number): Promise<AnswerRecord> {
  const itemId = Number(id);
  const studentId = await getStudentId();
  await withTransaction(async (client) => {
    const hist = await client.query<{ id: string }>(
      `SELECT id FROM answer_attempt
       WHERE content_item_id = $1 AND student_id = $2 AND is_current = false
       ORDER BY created_at ASC`,
      [itemId, studentId],
    );
    if (index < 0 || index >= hist.rows.length) {
      throw new Error(`histórico indisponível para ${id} (índice ${index})`);
    }
    await client.query(
      "UPDATE answer_attempt SET is_current = false WHERE content_item_id = $1 AND student_id = $2 AND is_current",
      [itemId, studentId],
    );
    await client.query("UPDATE answer_attempt SET is_current = true WHERE id = $1", [hist.rows[index].id]);
  });
  const rec = await getAnswerRecord(itemId);
  if (!rec) throw new Error(`histórico indisponível para ${id}`);
  return rec;
}

export async function clearAnswerHistory(id: number | string): Promise<AnswerRecord> {
  const itemId = Number(id);
  const studentId = await getStudentId();
  await query(
    "DELETE FROM answer_attempt WHERE content_item_id = $1 AND student_id = $2 AND is_current = false",
    [itemId, studentId],
  );
  return (
    (await getAnswerRecord(itemId)) ?? {
      answer: "",
      updatedAt: new Date().toISOString(),
      source: "ai",
      selections: [],
      history: [],
    }
  );
}

// ── Overrides / annotations ─────────────────────────────────────────────────

interface AnnotationRow {
  content_item_id: string;
  notes: string | null;
  prompt_override: string | null;
  hidden: boolean;
  tag: string | null;
  manual_status: string | null;
  ai_request_json: unknown;
}

export async function getOverrides(): Promise<Overrides> {
  const studentId = await getStudentId();
  const rows = await query<AnnotationRow>(
    `SELECT content_item_id, notes, prompt_override, hidden, tag, manual_status, ai_request_json
     FROM item_annotation WHERE student_id = $1`,
    [studentId],
  );
  const out: Overrides = {};
  for (const r of rows) {
    const entry: OverridesEntry = {};
    if (r.notes != null) entry.notes = r.notes;
    if (r.prompt_override != null) entry.promptOverride = r.prompt_override;
    if (r.hidden) entry.hide = true;
    if (r.tag != null) entry.tag = r.tag;
    if (r.manual_status != null) entry.manualStatus = r.manual_status as ExerciseStatus;
    if (r.ai_request_json != null) {
      entry.aiRequest =
        typeof r.ai_request_json === "string" ? r.ai_request_json : JSON.stringify(r.ai_request_json);
    }
    out[String(r.content_item_id)] = entry;
  }
  return out;
}

export async function saveNote(itemId: number, notes: string): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, notes, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now()`,
    [itemId, studentId, notes],
  );
}

export async function saveAiRequest(itemId: number, raw: string | null): Promise<void> {
  const studentId = await getStudentId();
  let json: unknown = null;
  if (raw != null) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, ai_request_json, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET ai_request_json = EXCLUDED.ai_request_json, updated_at = now()`,
    [itemId, studentId, json],
  );
}

export async function setManualStatus(itemId: number, status: ExerciseStatus): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, manual_status, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET manual_status = EXCLUDED.manual_status, updated_at = now()`,
    [itemId, studentId, status],
  );
}

// ── Submissions ─────────────────────────────────────────────────────────────

interface SubmissionRow {
  content_item_id: string;
  at: Date;
  status: string;
  mode: string | null;
  attachment_name: string | null;
  attempt_number: number | null;
  detail: string | null;
  portal_detail: string | null;
  confirmation_at: Date | null;
  answer: string | null;
}

function toSubmissionEntry(r: SubmissionRow): SubmissionEntry {
  return {
    exerciseId: Number(r.content_item_id),
    at: iso(r.at),
    status: r.status as SubmissionEntry["status"],
    detail: r.detail ?? "",
    answer: r.answer ?? undefined,
    mode: (r.mode as SubmissionEntry["mode"]) ?? undefined,
    attachmentName: r.attachment_name ?? undefined,
    attemptNumber: r.attempt_number,
    portalDetail: r.portal_detail ?? undefined,
    confirmationAt: r.confirmation_at ? iso(r.confirmation_at) : undefined,
  };
}

export async function getSubmissions(): Promise<Submissions> {
  const studentId = await getStudentId();
  const rows = await query<SubmissionRow>(
    `SELECT content_item_id, at, status, mode, attachment_name, attempt_number, detail, portal_detail, confirmation_at, answer
     FROM submission WHERE student_id = $1 ORDER BY at`,
    [studentId],
  );
  const out: Submissions = {};
  for (const r of rows) {
    const key = String(r.content_item_id);
    (out[key] ??= []).push(toSubmissionEntry(r));
  }
  return out;
}

/** Insert a submission, or update the existing row with the same (item, at). */
export async function appendSubmission(entry: SubmissionEntry): Promise<void> {
  const studentId = await getStudentId();
  const at = entry.at ? new Date(entry.at) : new Date();
  await query(
    `INSERT INTO submission(student_id, content_item_id, at, status, mode, attachment_name,
       attempt_number, detail, portal_detail, confirmation_at, answer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (content_item_id, student_id, at) DO UPDATE SET
       status = EXCLUDED.status,
       mode = EXCLUDED.mode,
       attachment_name = EXCLUDED.attachment_name,
       attempt_number = EXCLUDED.attempt_number,
       detail = EXCLUDED.detail,
       portal_detail = EXCLUDED.portal_detail,
       confirmation_at = EXCLUDED.confirmation_at,
       answer = EXCLUDED.answer`,
    [
      studentId,
      entry.exerciseId,
      at,
      entry.status,
      entry.mode ?? null,
      entry.attachmentName ?? null,
      entry.attemptNumber ?? null,
      entry.detail ?? null,
      entry.portalDetail ?? null,
      entry.confirmationAt ? new Date(entry.confirmationAt) : null,
      entry.answer ?? null,
    ],
  );
}

export async function lastSubmission(exerciseId: number): Promise<SubmissionEntry | null> {
  const list = (await getSubmissions())[String(exerciseId)] ?? [];
  return list.length ? list[list.length - 1] : null;
}

export async function submissionsFor(exerciseId: number): Promise<SubmissionEntry[]> {
  return (await getSubmissions())[String(exerciseId)] ?? [];
}

// ── AI config + runs ────────────────────────────────────────────────────────

interface AiConfigRow {
  provider: string;
  model: string;
  temperature: number | null;
  max_output_tokens: number | null;
  style_json: unknown;
  sections_json: unknown;
}

export async function getAiConfig(): Promise<AiConfig> {
  const studentId = await getStudentId();
  const rows = await query<AiConfigRow>(
    "SELECT provider, model, temperature, max_output_tokens, style_json, sections_json FROM ai_config WHERE student_id = $1",
    [studentId],
  );
  const row = rows[0];
  if (!row) {
    // Seed the DB once from the committed JSON config (or defaults).
    const legacy = loadAiConfig();
    await saveAiConfig(legacy).catch(() => undefined);
    return legacy;
  }
  return {
    provider: "openai",
    model: row.model,
    temperature: row.temperature ?? 0.7,
    max_output_tokens: row.max_output_tokens ?? undefined,
    style: { ...DEFAULT_STYLE, ...((row.style_json as Partial<AiConfig["style"]>) ?? {}) },
    activitySections: {
      ...DEFAULT_ACTIVITY_SECTIONS,
      ...((row.sections_json as Partial<AiConfig["activitySections"]>) ?? {}),
    },
  };
}

export async function saveAiConfig(cfg: AiConfig): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO ai_config(student_id, provider, model, temperature, max_output_tokens, style_json, sections_json, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (student_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       temperature = EXCLUDED.temperature,
       max_output_tokens = EXCLUDED.max_output_tokens,
       style_json = EXCLUDED.style_json,
       sections_json = EXCLUDED.sections_json,
       updated_at = now()`,
    [
      studentId,
      cfg.provider,
      cfg.model,
      cfg.temperature ?? null,
      cfg.max_output_tokens ?? null,
      JSON.stringify(cfg.style),
      JSON.stringify(cfg.activitySections),
    ],
  );
}

export interface AiRunRecord {
  contentItemId: number | null;
  prompt: string;
  promptHash: string;
  completion: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  answerAttemptId: number | null;
}

export async function recordAiRun(run: AiRunRecord): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO ai_run(student_id, content_item_id, prompt, prompt_hash, completion, model, tokens_in, tokens_out, latency_ms, answer_attempt_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      studentId,
      run.contentItemId,
      run.prompt,
      run.promptHash,
      run.completion,
      run.model,
      run.tokensIn,
      run.tokensOut,
      run.latencyMs,
      run.answerAttemptId,
    ],
  );
}

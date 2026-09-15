import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { query } from "./db.js";
import { ASSISTANT_EXERCISES_FILE } from "./build.js";
import { actionKindFor, detectAnomalies, flavorFromAnomalies, isSurveyItem, localFilesFor, needsFlavorReview, parseForumInfo, stripHtml } from "./build.js";
import { sanitizeHtml } from "./sanitize.js";
import { computeStatus, daysLeft } from "./status.js";
import type { ContentKind, Exercise, ExerciseKind, ForumInfo, QuizQ, QuizOption } from "./types.js";

interface RawItemLike {
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  sectionId: number | null;
  sectionTitle: string | null;
  itemId: number;
  itemTitle: string;
  topicTypeId: number;
  kind: ContentKind;
  isRecordProgress: boolean;
  done: boolean;
  viewed?: boolean;
  hasDeadline: boolean;
  deadlineAt: string | null;
  html: string | null;
  content: Record<string, unknown> | null;
  attachments: { url: string; filename: string | null; filesize: number | null }[];
  origin?: "tree" | "gradebook";
  topicAvailable?: boolean;
}

interface ViewRow {
  id: string;
  title: string;
  kind: string;
  enrollment_id: string | null;
  course_id: string;
  course_name: string;
  module_id: string | null;
  module_title: string | null;
  module_name: string | null;
  section_id: string | null;
  section_title: string | null;
  topic_type_id: number;
  is_record_progress: boolean;
  has_deadline: boolean;
  html: string | null;
  raw_json: RawItemLike | null;
  professor_id: string | null;
  professor_name: string | null;
  done: boolean | null;
  status: string | null;
}

interface QuestionRow {
  id: string;
  content_item_id: string;
  text: string;
  position: number;
}

interface OptionRow {
  id: string;
  question_id: string;
  position: number;
  text: string;
}

interface AttachmentRow {
  content_item_id: string;
  url: string | null;
  filename: string | null;
}

async function loadQuestions(): Promise<Map<number, QuizQ[]>> {
  const [questions, options] = await Promise.all([
    query<QuestionRow>(
      "SELECT id, content_item_id, text, position FROM question ORDER BY content_item_id, position",
    ),
    query<OptionRow>(
      "SELECT id, question_id, position, text FROM question_option ORDER BY question_id, position",
    ),
  ]);
  const optionsByQuestion = new Map<number, QuizOption[]>();
  for (const o of options) {
    const list = optionsByQuestion.get(Number(o.question_id)) ?? [];
    list.push({ id: Number(o.id), text: o.text });
    optionsByQuestion.set(Number(o.question_id), list);
  }
  const byItem = new Map<number, QuizQ[]>();
  for (const q of questions) {
    const list = byItem.get(Number(q.content_item_id)) ?? [];
    list.push({ id: Number(q.id), text: q.text, options: optionsByQuestion.get(Number(q.id)) ?? [] });
    byItem.set(Number(q.content_item_id), list);
  }
  return byItem;
}

async function loadAttachments(): Promise<Map<number, { filename: string | null; url: string }[]>> {
  const rows = await query<AttachmentRow>(
    "SELECT content_item_id, url, filename FROM attachment ORDER BY id",
  );
  const byItem = new Map<number, { filename: string | null; url: string }[]>();
  for (const a of rows) {
    if (!a.url) continue;
    const list = byItem.get(Number(a.content_item_id)) ?? [];
    list.push({ filename: a.filename, url: a.url });
    byItem.set(Number(a.content_item_id), list);
  }
  return byItem;
}

/** Build the UI `Exercise[]` projection from the Postgres read model. */
export async function buildProjection(): Promise<Exercise[]> {
  const [rows, questions, attachments] = await Promise.all([
    query<ViewRow>("SELECT * FROM v_exercise_current ORDER BY course_id, module_id, id"),
    loadQuestions(),
    loadAttachments(),
  ]);

  const out: Exercise[] = [];
  for (const row of rows) {
    const raw = row.raw_json;
    if (!raw) continue;
    const courseId = Number(row.course_id);
    const itemId = Number(row.id);
    const kind = actionKindFor({ kind: raw.kind, isRecordProgress: row.is_record_progress });
    if (!kind) continue;

    const deadlineAt = raw.deadlineAt ?? null;
    const done = row.done ?? raw.done === true;
    const hasDeadline = row.has_deadline;
    const status = computeStatus(done, hasDeadline, deadlineAt);
    const contentKind = raw.kind;
    const itemQuestions = kind === "quiz" ? questions.get(itemId) ?? [] : [];
    const anomalies = detectAnomalies({
      kind: raw.kind,
      title: row.title,
      html: raw.html,
      content: raw.content,
      attachments: raw.attachments ?? [],
      questions: itemQuestions,
    });

    out.push({
      id: itemId,
      title: row.title,
      kind,
      flavor: flavorFromAnomalies(anomalies),
      flavorSource: "auto",
      anomalies,
      needsReview: needsFlavorReview({
        kind: raw.kind,
        title: row.title,
        html: raw.html,
        anomalies,
      }),
      enrollmentId: row.enrollment_id != null ? Number(row.enrollment_id) : null,
      isSurvey:
        kind === "quiz" &&
        isSurveyItem(row.title, `${raw.html ?? ""} ${String(raw.content?.instructions ?? "")}`),
      contentKind,
      isRecordProgress: row.is_record_progress === true,
      origin: raw.origin ?? "tree",
      topicAvailable: raw.topicAvailable !== false,
      courseId,
      courseName: row.course_name,
      moduleId: Number(row.module_id),
      moduleTitle: row.module_title ?? "",
      moduleName: row.module_name ?? row.module_title ?? "",
      professor: row.professor_name,
      professorId: row.professor_id != null ? Number(row.professor_id) : null,
      sectionId: row.section_id != null ? Number(row.section_id) : null,
      sectionTitle: row.section_title,
      topicTypeId: row.topic_type_id,
      status,
      done,
      hasDeadline,
      deadlineAt,
      daysLeft: daysLeft(deadlineAt),
      files: localFilesFor(courseId, itemId),
      remoteFiles: attachments.get(itemId) ?? [],
      instructionsText: stripHtml(raw.html),
      instructionsHtml: sanitizeHtml(raw.html),
      questions: itemQuestions,
      forum: kind === "forum" ? parseForumInfo(raw.content) : null,
      ai: { status: "none", answer: null, updatedAt: null },
    });
  }
  return out;
}

/**
 * Bump whenever the projection *shape* changes (new/renamed fields), so a code
 * update invalidates the cached `exercises.json` on the next server boot even
 * when the underlying catalog rows are unchanged.
 */
const PROJECTION_VERSION = "5";

/** Stable hash of the catalog + state snapshots the projection depends on. */
export async function getCatalogVersion(): Promise<string> {
  const rows = await query<{ version: string }>(
    `SELECT md5(
       $1 || ':' ||
       (SELECT count(*)::text FROM content_item) || ':' ||
       COALESCE((SELECT max(updated_at)::text FROM content_item), '') || ':' ||
       (SELECT count(*)::text FROM item_state) || ':' ||
       COALESCE((SELECT max(captured_at)::text FROM item_state), '')
     ) AS version`,
    [PROJECTION_VERSION],
  );
  return rows[0]?.version ?? "";
}

/** Read the cache metadata header without loading the exercises. */
export function readProjectionMeta(): { generatedAt?: string; catalogVersion?: string } | null {
  if (!existsSync(ASSISTANT_EXERCISES_FILE)) return null;
  try {
    return JSON.parse(readFileSync(ASSISTANT_EXERCISES_FILE, "utf-8")) as {
      generatedAt?: string;
      catalogVersion?: string;
    };
  } catch {
    return null;
  }
}

/** Project the DB read model to `apps/server/data/exercises.json` (the UI cache). */
export async function writeProjection(): Promise<{ file: string; count: number }> {
  const exercises = await buildProjection();
  const catalogVersion = await getCatalogVersion();
  mkdirSync(path.dirname(ASSISTANT_EXERCISES_FILE), { recursive: true });
  writeFileSync(
    ASSISTANT_EXERCISES_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), catalogVersion, exercises }, null, 2),
    "utf-8",
  );
  return { file: ASSISTANT_EXERCISES_FILE, count: exercises.length };
}

export type { ExerciseKind, ForumInfo };

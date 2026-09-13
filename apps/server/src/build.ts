import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { assist, dataDir, raw } from "./paths.js";
import { computeStatus, daysLeft, refreshLive } from "./status.js";
import type { Anomaly, AnomalyCode, AnomalySeverity, ContentKind, Exercise, ExerciseKind, ForumInfo, ForumPost, PdfRef, QuizQ, UploadFlavor } from "./types.js";

interface TreeItem {
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
  hasDeadline: boolean;
  deadlineAt: string | null;
  attachments: { url: string; filename: string | null; filesize: number | null }[];
  html: string | null;
  content: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
}

/** Raw kinds that the portal lets the student complete with "Mark as completed". */
const MARKABLE_CONTENT: ContentKind[] = ["pdf", "reading", "link", "other"];

/**
 * A "Pesquisa" is a quiz-like survey with no grade or attempt: it is answered
 * straight through the endpoint. The portal does not expose a distinct type for
 * it, so match the title/instructions (pt-BR "Pesquisa", "Enquete", "Survey",
 * or the "Responda sinceramente" prompt).
 */
export function isSurveyItem(title: string, instructions: string): boolean {
  const text = `${title} ${instructions}`.toLowerCase();
  return /\bpesquisa\b|\benquete\b|\bsurvey\b/.test(text) || /responda sinceramente/.test(text);
}

/**
 * Map a raw content item to the action bucket shown in the UI, or `null` when
 * the item has no action at all (plain reading/pdf/link without progress).
 */
export function actionKindFor(item: Pick<TreeItem, "kind" | "isRecordProgress">): ExerciseKind | null {
  if (item.kind === "file_upload") return "upload";
  if (item.kind === "quiz") return "quiz";
  if (item.kind === "forum") return "forum";
  if (item.isRecordProgress && MARKABLE_CONTENT.includes(item.kind)) return "mark";
  return null;
}

/** Keywords that mark a task as "attach a screenshot/print of your work". */
const PRINT_RE =
  /\bprint\b|printar|screenshot|captura de tela|captura|captur[ae]|foto(grafia)?|imagem|recorte/i;

/** Badge tone per anomaly code: error = red outline, warn = amber outline. */
export const ANOMALY_SEVERITY: Record<AnomalyCode, AnomalySeverity> = {
  ghost: "error",
  print: "warn",
};

export function makeAnomaly(code: AnomalyCode): Anomaly {
  return { code, severity: ANOMALY_SEVERITY[code] };
}

/**
 * Detect content anomalies for a task (before any tag override):
 * - `ghost` — no question at all: a task with no upload box, a quiz with zero
 *   questions, or an item with empty instructions and no attachments.
 * - `print` — the instruction asks for a screenshot/print the student attaches.
 */
export function detectAnomalies(input: {
  kind: ContentKind;
  title: string;
  html: string | null;
  content: Record<string, unknown> | null;
  attachments: unknown[];
  questions: QuizQ[];
}): Anomaly[] {
  const { kind, title, html, content, attachments, questions } = input;

  if (kind === "quiz") {
    return questions.length === 0 ? [makeAnomaly("ghost")] : [];
  }

  if (kind === "file_upload") {
    const hasFileUpload =
      content && typeof content === "object" && "hasFileUpload" in content
        ? content.hasFileUpload === true
        : null;
    if (hasFileUpload === false) return [makeAnomaly("ghost")];

    const text = `${title} ${stripHtml(html)}`;
    if (PRINT_RE.test(text)) return [makeAnomaly("print")];

    const instructions = stripHtml(html);
    if (!instructions && (!attachments || attachments.length === 0)) return [makeAnomaly("ghost")];
    return [];
  }

  return [];
}

/** Primary flavor derived from the anomaly list (`question` when none). */
export function flavorFromAnomalies(anomalies: Anomaly[]): UploadFlavor {
  if (anomalies.some((a) => a.code === "ghost")) return "ghost";
  if (anomalies.some((a) => a.code === "print")) return "print";
  return "question";
}

/**
 * Anomalies implied by a manual tag: `[]` forces "no anomaly" (question), a
 * code list forces those anomalies, and `null` means neutral (use auto).
 */
export function anomaliesFromTag(tag: string | null | undefined): Anomaly[] | null {
  if (!tag) return null;
  if (tag === "question") return [];
  if (tag === "print") return [makeAnomaly("print")];
  if (tag === "ghost" || tag === "anomalia") return [makeAnomaly("ghost")];
  return null;
}

/** Back-compat: effective flavor from a tag, or null when the tag is neutral. */
export function flavorFromTag(tag: string | null | undefined): UploadFlavor | null {
  const anomalies = anomaliesFromTag(tag);
  return anomalies ? flavorFromAnomalies(anomalies) : null;
}

/** Parse the `content.posts[]` array fetched at dump time. */
export function parseForumPosts(raw: unknown): ForumPost[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => {
    const r = p as Record<string, unknown>;
    return {
      id: Number(r.id),
      topicId: Number(r.topicId ?? 0),
      html: String(r.html ?? ""),
      createdAt: String(r.createdAt ?? ""),
      updatedAt: String(r.updatedAt ?? ""),
      isEdited: r.isEdited === true,
      enrollmentId: Number(r.enrollmentId ?? 0),
      parentPostId: r.parentPostId != null ? Number(r.parentPostId) : null,
      isHidden: r.isHidden === true,
      isDeleted: r.isDeleted === true,
      postOwnerUsername: String(r.postOwnerUsername ?? ""),
      postOwnerProfilePhoto: r.postOwnerProfilePhoto != null ? String(r.postOwnerProfilePhoto) : null,
      postOwnerSafeaRole: r.postOwnerSafeaRole != null ? String(r.postOwnerSafeaRole) : null,
      postOwnerRoleName: r.postOwnerRoleName != null ? String(r.postOwnerRoleName) : null,
      children: parseForumPosts(r.children),
      enrollmentIdsWhoLiked: Array.isArray(r.enrollmentIdsWhoLiked) ? r.enrollmentIdsWhoLiked.map(Number) : [],
    };
  });
}

/** Extract forum state from a forum topic's `content` object (null when absent). */
export function parseForumInfo(content: Record<string, unknown> | null | undefined): ForumInfo | null {
  if (!content || !("countPosts" in content) || !("posts" in content)) return null;
  return {
    countPosts: Number(content.countPosts ?? 0),
    countOfMyPosts: Number(content.countOfMyPosts ?? 0),
    isAllowLikes: content.isAllowLikes === true,
    isToLimitResponses: content.isToLimitResponses === true,
    maxAnswerPerStudent: Number(content.maxAnswerPerStudent ?? 0),
    isOnlyVisibleToPeopleWithPost: content.isOnlyVisibleToPeopleWithPost === true,
    hasReachedPostLimit: content.hasReachedPostLimit === true,
    posts: parseForumPosts(content.posts),
  };
}

interface Course {
  courseId: number;
  courseName: string;
  items: TreeItem[];
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ").replace(/&ccedil;/gi, "ç")
    .replace(/\s+/g, " ")
    .trim();
}

/** Locate the on-disk course folder for a course id (e.g. "5254272-…"). */
export function courseDirFor(courseId: number): string | null {
  const coursesRoot = path.join(dataDir(), "courses");
  if (!existsSync(coursesRoot)) return null;
  try {
    const found = readdirSync(coursesRoot).find((d) => d.startsWith(`${courseId}-`));
    return found ?? null;
  } catch {
    return null;
  }
}

export function localFilesFor(courseId: number, itemId: number): PdfRef[] {
  const dir = courseDirFor(courseId);
  if (!dir) return [];
  const filesRoot = path.join(dataDir(), "courses", dir, "files");
  if (!existsSync(filesRoot)) return [];
  let names: string[];
  try {
    names = readdirSync(filesRoot);
  } catch {
    return [];
  }
  const mine = names.filter((n) => n.startsWith(`${itemId}_`) || n.startsWith(`${itemId}.`) || n === String(itemId));
  return mine.map((name) => {
    const absPath = path.join(filesRoot, name);
    const relPath = path.join("scraped", "courses", dir, "files", name);
    return {
      name,
      relPath: relPath.split(path.sep).join("/"),
      absPath,
      remoteUrl: "",
    };
  });
}

function parseQuestions(content: Record<string, unknown> | null): QuizQ[] {
  const qs = content?.questions;
  if (!Array.isArray(qs)) return [];
  return qs.map((q) => {
    const raw = q as Record<string, unknown>;
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => {
          const opt = o as Record<string, unknown>;
          return { id: Number(opt.id), text: stripHtml(String(opt.text ?? "")) };
        })
      : [];
    return { id: Number(raw.id), text: stripHtml(String(raw.enunciated ?? "")), options };
  });
}

/** Split a module title like "Arquitetura de Software - Prof. Leonardo Dias". */
export function splitModule(moduleTitle: string): { moduleName: string; professor: string | null } {
  const m = moduleTitle.match(/^(.*?)\s+-\s+(Profa?\.\s*.*)$/i);
  if (m) return { moduleName: m[1].trim(), professor: m[2].trim() };
  return { moduleName: moduleTitle.trim(), professor: null };
}

export function buildExercises(): Exercise[] {
  const file = raw("content-tree.json");
  if (!existsSync(file)) {
    throw new Error(`Missing ${file}. Run 'npm run dump' at the repo root first.`);
  }
  const courses = JSON.parse(readFileSync(file, "utf-8")) as Course[];
  const out: Exercise[] = [];
  for (const course of courses) {
    for (const it of course.items) {
      const kind = actionKindFor(it);
      if (!kind) continue;
      const deadlineAt = it.deadlineAt ?? null;
      const status = computeStatus(it.done, it.hasDeadline, deadlineAt);
      const { moduleName, professor } = splitModule(it.moduleTitle);
      const questions = kind === "quiz" ? parseQuestions(it.content) : [];
      const anomalies = detectAnomalies({
        kind: it.kind,
        title: it.itemTitle,
        html: it.html,
        content: it.content,
        attachments: it.attachments ?? [],
        questions,
      });
      out.push({
        id: it.itemId,
        title: it.itemTitle,
        kind,
        flavor: flavorFromAnomalies(anomalies),
        flavorSource: "auto",
        anomalies,
        enrollmentId: it.context?.enrollmentId != null ? Number(it.context.enrollmentId) : null,
        isSurvey:
          kind === "quiz" &&
          isSurveyItem(it.itemTitle, `${it.html ?? ""} ${String(it.content?.instructions ?? "")}`),
        contentKind: it.kind,
        isRecordProgress: it.isRecordProgress === true,
        courseId: course.courseId,
        courseName: course.courseName,
        moduleId: it.moduleId,
        moduleTitle: it.moduleTitle,
        moduleName,
        professor,
        professorId: null,
        sectionId: it.sectionId,
        sectionTitle: it.sectionTitle,
        topicTypeId: it.topicTypeId,
        status,
        done: it.done,
        hasDeadline: it.hasDeadline,
        deadlineAt,
        daysLeft: daysLeft(deadlineAt),
        files: localFilesFor(course.courseId, it.itemId),
        remoteFiles: it.attachments.map((a) => ({ filename: a.filename, url: a.url })),
        instructionsText: stripHtml(it.html),
        questions,
        forum: kind === "forum" ? parseForumInfo(it.content) : null,
        ai: { status: "none", answer: null, updatedAt: null },
      });
    }
  }
  return out;
}

export const ASSISTANT_EXERCISES_FILE = path.join(assist("data"), "exercises.json");

export function writeExercises(exercises: Exercise[]): string {
  mkdirSync(path.dirname(ASSISTANT_EXERCISES_FILE), { recursive: true });
  writeFileSync(
    ASSISTANT_EXERCISES_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), exercises }, null, 2),
    "utf-8",
  );
  return ASSISTANT_EXERCISES_FILE;
}

export function loadExercises(): Exercise[] {
  const file = ASSISTANT_EXERCISES_FILE;
  if (!existsSync(file)) throw new Error(`Missing ${file}. Run 'npm run index' first.`);
  const data = JSON.parse(readFileSync(file, "utf-8")) as { exercises: Exercise[] };
  for (const e of data.exercises) {
    // Defensive: a cache written before the flavor/anomaly fields existed.
    if (!e.flavor) {
      e.flavor = "question";
      e.flavorSource = "auto";
    }
    if (!Array.isArray(e.anomalies)) e.anomalies = [];
    const { status, daysLeft: liveDays } = refreshLive(e);
    e.status = status;
    e.daysLeft = liveDays;
  }
  return data.exercises;
}

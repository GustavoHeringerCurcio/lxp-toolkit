import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { assist, dataDir, raw } from "./paths.js";
import { computeStatus, daysLeft } from "./status.js";
import type { Exercise, PdfRef, QuizQ } from "./types.js";

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
  kind: string;
  done: boolean;
  hasDeadline: boolean;
  deadlineAt: string | null;
  attachments: { url: string; filename: string | null; filesize: number | null }[];
  html: string | null;
  content: Record<string, unknown> | null;
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
    const relPath = path.join("docs", "courses", dir, "files", name);
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
      ? raw.options.map((o) => stripHtml(String((o as Record<string, unknown>).text ?? "")))
      : [];
    return { id: Number(raw.id), text: stripHtml(String(raw.enunciated ?? "")), options };
  });
}

export function buildExercises(): Exercise[] {
  const file = raw("content-tree.json");
  if (!existsSync(file)) {
    throw new Error(`Missing ${file}. Run 'npm run dump' in the study repo first.`);
  }
  const courses = JSON.parse(readFileSync(file, "utf-8")) as Course[];
  const out: Exercise[] = [];
  for (const course of courses) {
    for (const it of course.items) {
      if (it.kind !== "file_upload" && it.kind !== "quiz") continue;
      const deadlineAt = it.deadlineAt ?? null;
      const status = computeStatus(it.done, it.hasDeadline, deadlineAt);
      out.push({
        id: it.itemId,
        title: it.itemTitle,
        kind: it.kind === "file_upload" ? "upload" : "quiz",
        courseId: course.courseId,
        courseName: course.courseName,
        moduleId: it.moduleId,
        moduleTitle: it.moduleTitle,
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
        questions: it.kind === "quiz" ? parseQuestions(it.content) : [],
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
  return data.exercises;
}

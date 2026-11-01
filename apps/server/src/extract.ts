/**
 * Precompute the course material text into Postgres (`content_text`).
 *
 * The portal exposes very few quizzes, so the Treino knowledge pack is built
 * from readings/PDFs/attachments. Extracting on every request is slow and
 * capped; doing it once at index time makes the AI grounded and fast.
 *
 * PDFs are parsed with pdf-parse; html/text are read directly; Office/zip files
 * are marked `unsupported` (no LibreOffice in most installs).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { query } from "./db.js";
import { dataDir } from "./paths.js";
import { localFilesFor } from "./build.js";
import { extractFileText } from "./pdf.js";

const MAX_ITEM_CHARS = 60_000;
const CONCURRENCY = 4;

const TEXT_EXTS = new Set([".txt", ".md", ".csv"]);
const HTML_EXTS = new Set([".html", ".htm"]);
const OFFICE_EXTS = new Set([
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
]);

type FileKind = "pdf" | "office" | "html" | "text" | "other";
type TextStatus = "ok" | "empty" | "unsupported" | "error";

function fileKind(absPath: string): FileKind {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (OFFICE_EXTS.has(ext)) return "office";
  if (HTML_EXTS.has(ext)) return "html";
  if (TEXT_EXTS.has(ext)) return "text";
  return "other";
}

interface ItemRef {
  id: string;
  course_id: string;
}

interface Extracted {
  source_kind: string;
  text: string;
  status: TextStatus;
  content_hash: string | null;
}

function readPlain(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}

function signature(itemId: number, files: { absPath: string; name: string }[]): string {
  const parts = files.map((f) => {
    try {
      const s = statSync(f.absPath);
      return `${f.name}:${s.size}:${Math.round(s.mtimeMs)}`;
    } catch {
      return `${f.name}:0`;
    }
  });
  return createHash("sha256").update(`${itemId}|${parts.join("|")}`).digest("hex");
}

async function extractItem(item: ItemRef): Promise<Extracted> {
  const courseId = Number(item.course_id);
  const itemId = Number(item.id);
  const files = localFilesFor(courseId, itemId);
  if (files.length === 0) {
    return { source_kind: "none", text: "", status: "empty", content_hash: null };
  }

  const kinds = files.map((f) => fileKind(f.absPath));
  const dominant: FileKind = kinds.includes("pdf")
    ? "pdf"
    : kinds.includes("office")
      ? "office"
      : kinds.includes("html")
        ? "html"
        : kinds.includes("text")
          ? "text"
          : "other";

  const chunks: string[] = [];
  let sawUnsupported = false;
  let sawError = false;

  for (const file of files) {
    const kind = fileKind(file.absPath);
    let text: string | null = null;
    if (kind === "pdf" || kind === "office") {
      try {
        text = await extractFileText(file.absPath);
      } catch {
        sawError = true;
      }
      if (!text && kind === "office") {
        // Office conversion needs LibreOffice, which is often unavailable.
        sawUnsupported = true;
      }
    } else if (kind === "html" || kind === "text") {
      text = readPlain(file.absPath);
    } else {
      sawUnsupported = true;
    }
    if (text && text.trim()) chunks.push(`--- ${file.name} ---\n${text.trim()}`);
  }

  const text = chunks.join("\n\n").slice(0, MAX_ITEM_CHARS);
  const status: TextStatus = text.length > 0 ? "ok" : sawError ? "error" : sawUnsupported ? "unsupported" : "empty";
  return {
    source_kind: text.length > 0 ? dominant : sawUnsupported ? "unsupported" : "none",
    text,
    status,
    content_hash: signature(itemId, files),
  };
}

export interface ExtractSummary {
  items: number;
  withText: number;
  unsupported: number;
  empty: number;
  skipped: number;
  totalChars: number;
}

/** Extract + upsert `content_text` for every content item (skips unchanged files). */
export async function extractAllContentText(): Promise<ExtractSummary> {
  const items = await query<ItemRef>("SELECT id, course_id FROM content_item ORDER BY course_id, id");
  const existing = new Map<string, string | null>();
  for (const row of await query<{ content_item_id: string; content_hash: string | null }>(
    "SELECT content_item_id, content_hash FROM content_text",
  )) {
    existing.set(String(row.content_item_id), row.content_hash);
  }

  const summary: ExtractSummary = {
    items: items.length,
    withText: 0,
    unsupported: 0,
    empty: 0,
    skipped: 0,
    totalChars: 0,
  };

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor++];
      const key = String(item.id);
      const files = localFilesFor(Number(item.course_id), Number(item.id));
      const hash = files.length ? signature(Number(item.id), files) : null;
      if (existing.has(key) && existing.get(key) === hash) {
        summary.skipped++;
        continue;
      }
      let result: Extracted;
      try {
        result = await extractItem(item);
      } catch {
        result = { source_kind: "none", text: "", status: "error", content_hash: hash };
      }
      await query(
        `INSERT INTO content_text(content_item_id, source_kind, text, char_count, status, content_hash, extracted_at)
         VALUES ($1,$2,$3,$4,$5,$6, now())
         ON CONFLICT (content_item_id) DO UPDATE SET
           source_kind = EXCLUDED.source_kind,
           text = EXCLUDED.text,
           char_count = EXCLUDED.char_count,
           status = EXCLUDED.status,
           content_hash = EXCLUDED.content_hash,
           extracted_at = now()`,
        [Number(item.id), result.source_kind, result.text, result.text.length, result.status, result.content_hash],
      );
      if (result.status === "ok") {
        summary.withText++;
        summary.totalChars += result.text.length;
      } else if (result.status === "unsupported") {
        summary.unsupported++;
      } else {
        summary.empty++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));
  return summary;
}

/** Populate `content_text` once when empty and scraped files exist (bootstrap). */
export async function ensureContentText(): Promise<ExtractSummary | null> {
  const rows = await query<{ n: string }>("SELECT count(*)::text AS n FROM content_text");
  if (Number(rows[0]?.n ?? "0") > 0) return null;
  if (!existsSync(path.join(dataDir(), "courses"))) return null;
  return extractAllContentText();
}

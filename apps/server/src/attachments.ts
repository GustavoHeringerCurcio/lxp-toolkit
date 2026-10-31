/**
 * Activity attachments for the generation call.
 *
 * Text extraction (`extractFileText`) loses diagrams, charts and scanned
 * pages. When `readAttachments` is enabled we additionally send the original
 * files as Chat Completions content parts:
 *   - PDFs → `file` parts (OpenAI sends extracted text *and* page images to
 *     vision models, so diagrams are visible);
 *   - Office/OpenDocument → converted to PDF with LibreOffice, then attached;
 *   - images → `image_url` parts (base64 data URL).
 *
 * Plain text formats stay text-only (cheaper and already complete).
 * Every limit here is deliberately conservative: OpenAI caps a request at
 * 50 MB across files, and PDF page images cost input tokens.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { officeToPdf } from "./office.js";
import type { PdfRef } from "./types.js";

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;

/** Minimal shape of the content parts we send (avoids importing OpenAI here). */
export type AiAttachmentPart =
  | { type: "file"; file: { filename: string; file_data: string } }
  | { type: "image_url"; image_url: { url: string; detail: "high" } };

export interface SkippedAttachment {
  name: string;
  reason: string;
}

export interface BuiltAttachments {
  parts: AiAttachmentPart[];
  /** Original local file names that were attached (their text is not duplicated). */
  attachedNames: Set<string>;
  skipped: SkippedAttachment[];
}

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function pdfDataUrl(buf: Buffer): string {
  return `data:application/pdf;base64,${buf.toString("base64")}`;
}

function imageDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Build the attachment parts for the given local files. Never throws: files
 * that cannot be read/converted or exceed the caps are reported in `skipped`
 * so the prompt can say why they were not sent.
 */
export async function buildAiAttachments(files: PdfRef[]): Promise<BuiltAttachments> {
  const parts: AiAttachmentPart[] = [];
  const attachedNames = new Set<string>();
  const skipped: SkippedAttachment[] = [];
  let total = 0;

  for (const file of files) {
    if (parts.length >= MAX_ATTACHMENTS) {
      skipped.push({ name: file.name, reason: "limite de arquivos por envio" });
      continue;
    }

    const ext = path.extname(file.name).toLowerCase();
    const imageMime = IMAGE_MIME[ext];

    let bytes: Buffer | null = null;
    let filename = file.name;
    let kind: "pdf" | "image" | null = null;

    try {
      if (ext === ".pdf") {
        bytes = readFileSync(file.absPath);
        kind = "pdf";
      } else if (imageMime) {
        bytes = readFileSync(file.absPath);
        kind = "image";
      } else {
        // Office/OpenDocument: LibreOffice renders it to PDF, which keeps the
        // embedded diagrams/images that plain text extraction drops.
        const pdf = await officeToPdf(file.absPath);
        if (pdf) {
          bytes = readFileSync(pdf);
          filename = file.name.replace(/\.[a-z0-9]+$/i, ".pdf");
          kind = "pdf";
        }
      }
    } catch {
      bytes = null;
    }

    if (!kind || !bytes) {
      skipped.push({ name: file.name, reason: "não foi possível ler/converter" });
      continue;
    }
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      skipped.push({ name: file.name, reason: "arquivo maior que 10 MB" });
      continue;
    }
    if (total + bytes.length > MAX_TOTAL_ATTACHMENT_BYTES) {
      skipped.push({ name: file.name, reason: "limite total de 40 MB" });
      continue;
    }

    total += bytes.length;
    attachedNames.add(file.name);
    if (kind === "image" && imageMime) {
      parts.push({ type: "image_url", image_url: { url: imageDataUrl(bytes, imageMime), detail: "high" } });
    } else {
      parts.push({ type: "file", file: { filename, file_data: pdfDataUrl(bytes) } });
    }
  }

  return { parts, attachedNames, skipped };
}

/** True when the extension is an image we can send to the model. */
export function isImageAttachment(name: string): boolean {
  return Boolean(IMAGE_MIME[path.extname(name).toLowerCase()]);
}

/** True when the file will be attached as a PDF (native PDF or Office→PDF). */
export function isPdfAttachment(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") return true;
  const office = new Set([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".ods", ".odp", ".rtf"]);
  return office.has(ext);
}

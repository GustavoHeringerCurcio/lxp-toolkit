import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isOfficeFile, officeToPdf } from "./office.js";
import { assist } from "./paths.js";

/**
 * Extract text from a PDF file (works for text-based PDFs).
 * Returns null when the PDF has no extractable text (e.g. scanned).
 */
export async function extractPdfText(absPath: string): Promise<string | null> {
  try {
    const mod = (await import("pdf-parse")) as unknown as { default?: (buf: Buffer) => Promise<{ text: string }> };
    const parse = mod.default ?? (mod as unknown as (buf: Buffer) => Promise<{ text: string }>);
    const data = await parse(readFileSync(absPath));
    const text = (data.text ?? "").trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Extract text from an attached file. PDFs are parsed directly; Office /
 * OpenDocument files are converted to PDF with LibreOffice first (cached).
 * Returns null when nothing extractable is available.
 */
export async function extractFileText(absPath: string): Promise<string | null> {
  if (isOfficeFile(absPath)) {
    const pdf = await officeToPdf(absPath);
    return pdf ? extractPdfText(pdf) : null;
  }
  return extractPdfText(absPath);
}

/** Cache directory for answer PDFs generated before sending to the portal. */
export function answerPdfCacheDir(): string {
  return assist("data", "send-pdf");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Built-in text → PDF renderer (no LibreOffice required) ----------------

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 70.87; // 2.5cm
const TITLE_SIZE = 15;
const BODY_SIZE = 12;

// Standard Helvetica AFM widths (units/1000) for ASCII 32..126.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556,
  556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611,
  611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

function charWidth(code: number, bold: boolean): number {
  if (code >= 32 && code <= 126) {
    return (bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS)[code - 32];
  }
  return 556;
}

function textWidth(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) units += charWidth(ch.codePointAt(0) ?? 0, bold);
  return (units / 1000) * size;
}

/** Coerce arbitrary text into WinAnsiEncoding-safe characters. */
function toWinAnsi(text: string): string {
  const replaced = text
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-");
  let out = "";
  for (const ch of replaced) {
    const code = ch.codePointAt(0) ?? 0;
    out += (code >= 32 && code <= 126) || (code >= 160 && code <= 255) ? ch : "?";
  }
  return out;
}

function pdfString(text: string): string {
  return toWinAnsi(text).replace(/[\\()]/g, (c) => `\\${c}`);
}

function wrapLine(line: string, size: number, bold: boolean, maxWidth: number): string[] {
  if (!line.trim()) return [""];
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || textWidth(candidate, size, bold) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Minimal, dependency-free A4 PDF for plain-text answers. */
function renderTextPdf(title: string, answer: string): Buffer {
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const flow: { text: string; bold: boolean; size: number }[] = [];
  for (const l of wrapLine(title, TITLE_SIZE, true, maxWidth)) {
    flow.push({ text: l, bold: true, size: TITLE_SIZE });
  }
  flow.push({ text: "", bold: false, size: BODY_SIZE });
  for (const raw of answer.replace(/\r\n/g, "\n").split("\n")) {
    for (const l of wrapLine(raw, BODY_SIZE, false, maxWidth)) {
      flow.push({ text: l, bold: false, size: BODY_SIZE });
    }
  }

  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE_HEIGHT - PAGE_MARGIN;
  const flush = () => {
    if (ops.length) pages.push(ops.join("\n"));
    ops = [];
  };

  for (const line of flow) {
    const step = line.size * 1.5;
    if (y - step < PAGE_MARGIN && ops.length) {
      flush();
      y = PAGE_HEIGHT - PAGE_MARGIN;
    }
    if (line.text) {
      ops.push(`/${line.bold ? "F2" : "F1"} ${line.size} Tf`);
      ops.push(`1 0 0 1 ${PAGE_MARGIN.toFixed(2)} ${y.toFixed(2)} Tm`);
      ops.push(`(${pdfString(line.text)}) Tj`);
    }
    y -= step;
  }
  flush();
  if (pages.length === 0) pages.push("");

  const objects: string[] = [];
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  pages.forEach((content, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
    );
    const stream = `BT\n${content}\nET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/**
 * Render a plain-text answer to a PDF, cached by content + title. Uses
 * LibreOffice when available (styled HTML output) and otherwise falls back to
 * the built-in renderer, so `.pdf` delivery works without LibreOffice.
 */
export async function answerToPdf(answer: string, baseName: string): Promise<string | null> {
  const cache = answerPdfCacheDir();
  const key = createHash("sha256").update(`${baseName}\n${answer}`).digest("hex");
  const htmlPath = path.join(cache, `${key}.html`);
  const pdfPath = path.join(cache, `${key}.pdf`);
  if (existsSync(pdfPath)) return pdfPath;

  mkdirSync(cache, { recursive: true });
  if (!existsSync(htmlPath)) {
    const paragraphs = answer
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p>&nbsp;</p>"))
      .join("\n");
    const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(baseName)}</title>
<style>
  @page { margin: 2.5cm; }
  body { font-family: "Lato", Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #0F171D; }
  h1 { font-family: "Poppins", Arial, sans-serif; font-size: 15pt; margin: 0 0 1em; }
  p { margin: 0 0 0.6em; white-space: pre-wrap; }
</style></head>
<body><h1>${escapeHtml(baseName)}</h1>${paragraphs}</body></html>`;
    writeFileSync(htmlPath, html, "utf-8");
  }

  const converted = await officeToPdf(htmlPath, cache);
  if (converted) return converted;

  writeFileSync(pdfPath, renderTextPdf(baseName, answer));
  return pdfPath;
}

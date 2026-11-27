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

/**
 * Renderer revision mixed into the cache key. Bump it whenever the PDF output
 * changes, otherwise a stale file (e.g. one with a leading blank page) keeps
 * being served from `data/send-pdf`.
 */
const PDF_RENDER_VERSION = "2";

/** A diagram page to append to the final PDF. */
export interface PdfDiagram {
  png: Buffer;
  width: number;
  height: number;
  title?: string;
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
    if (ops.length) pages.push(`BT\n${ops.join("\n")}\nET`);
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

  return buildPdf(pages);
}

/** Assemble page content streams into a minimal PDF buffer. */
function buildPdf(pages: string[]): Buffer {
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
    const stream = content;
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

// ── Structure-aware ("fill") rendering ──────────────────────────────────────
//
// The "fill" send mode renders the AI draft as a PDF that preserves the shape
// of the answer: headings, lists, tables and inline bold. This is intentionally
// generic — it works for "fill a table", "mark the ( )", "complete a sheet",
// etc., without knowing the original template.

interface MdRun {
  text: string;
  bold: boolean;
}

type MdBlock =
  | { kind: "heading"; level: number; runs: MdRun[] }
  | { kind: "para"; runs: MdRun[] }
  | { kind: "list"; marker: string; depth: number; runs: MdRun[] }
  | { kind: "table"; header: string[]; rows: string[][]; columns: number }
  | { kind: "rule" }
  | { kind: "blank" };

function cleanInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|\s)[*_](\S)/g, "$1$2")
    .replace(/[*_]/g, "")
    .replace(/\\([|])/g, "$1");
}

function parseInline(raw: string): MdRun[] {
  const text = raw.replace(/`([^`]+)`/g, "$1");
  const runs: MdRun[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: cleanInline(text.slice(last, m.index)), bold: false });
    runs.push({ text: cleanInline(m[1] ?? m[2] ?? ""), bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: cleanInline(text.slice(last)), bold: false });
  const nonEmpty = runs.filter((r) => r.text.length > 0);
  return nonEmpty.length ? nonEmpty : [{ text: cleanInline(text), bold: false }];
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => cleanInline(c.trim()));
}

function isTableSeparator(line: string): boolean {
  return line.includes("-") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line);
}

function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      blocks.push({ kind: "blank" });
      i++;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const header = splitTableRow(tableLines[0]);
      const rows = tableLines.slice(1).filter((l) => !isTableSeparator(l)).map(splitTableRow);
      const columns = Math.max(header.length, ...rows.map((r) => r.length), 1);
      blocks.push({ kind: "table", header, rows, columns });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, runs: parseInline(h[2].trim()) });
      i++;
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s/g, ""))) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    const li = /^(\s*)([-*•+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, "  ").length / 2));
      const marker = /\d/.test(li[2]) ? `${li[2].replace(/[.)]$/, "")}.` : "•";
      blocks.push({ kind: "list", marker, depth, runs: parseInline(li[3].trim()) });
      i++;
      continue;
    }
    blocks.push({ kind: "para", runs: parseInline(trimmed.replace(/^>\s?/, "")) });
    i++;
  }
  return blocks;
}

interface WrappedLine {
  runs: MdRun[];
  indent: number;
}

function wrapRuns(
  runs: MdRun[],
  size: number,
  maxWidth: number,
  firstIndent: number,
  hangIndent: number,
): WrappedLine[] {
  const tokens: MdRun[] = [];
  for (const r of runs) {
    for (const part of r.text.split(/(\s+)/)) {
      if (part) tokens.push({ text: part, bold: r.bold });
    }
  }
  const out: WrappedLine[] = [];
  let current: MdRun[] = [];
  let width = 0;
  let indent = firstIndent;
  const push = () => {
    out.push({ runs: current, indent });
    current = [];
    width = 0;
    indent = hangIndent;
  };
  for (const tok of tokens) {
    const space = /^\s+$/.test(tok.text);
    const w = textWidth(tok.text, size, tok.bold);
    if (space) {
      if (!current.length) continue;
      if (width + w > maxWidth) {
        push();
        continue;
      }
      const last = current[current.length - 1];
      if (last.bold === tok.bold) last.text += " ";
      else current.push({ text: " ", bold: tok.bold });
      width += w;
      continue;
    }
    if (current.length && width + w > maxWidth) push();
    const last = current[current.length - 1];
    if (last && last.bold === tok.bold) last.text += tok.text;
    else current.push({ text: tok.text, bold: tok.bold });
    width += w;
  }
  if (current.length || out.length === 0) push();
  return out;
}

export function renderRichPdf(title: string, markdown: string): Buffer {
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const lineH = BODY_SIZE * 1.35;
  const blocks = parseMarkdown(markdown);
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const flush = () => {
    if (ops.length) pages.push(ops.join("\n"));
    ops = [];
  };
  const newPage = () => {
    flush();
    y = PAGE_HEIGHT - PAGE_MARGIN;
  };
  const room = (h: number): void => {
    if (y - h < PAGE_MARGIN && ops.length) newPage();
  };
  const drawRuns = (runs: MdRun[], x: number, yy: number, size: number) => {
    const parts: string[] = [];
    let cx = x;
    for (const r of runs) {
      if (!r.text) continue;
      parts.push(`/${r.bold ? "F2" : "F1"} ${size} Tf`);
      parts.push(`1 0 0 1 ${cx.toFixed(2)} ${yy.toFixed(2)} Tm`);
      parts.push(`(${pdfString(r.text)}) Tj`);
      cx += textWidth(r.text, size, r.bold);
    }
    if (parts.length) ops.push(`BT\n${parts.join("\n")}\nET`);
  };

  // Document title.
  for (const l of wrapLine(title, TITLE_SIZE, true, maxWidth)) {
    room(TITLE_SIZE * 1.6);
    drawRuns([{ text: l, bold: true }], PAGE_MARGIN, y, TITLE_SIZE);
    y -= TITLE_SIZE * 1.6;
  }
  y -= BODY_SIZE * 0.6;

  for (const b of blocks) {
    if (b.kind === "blank") {
      y -= BODY_SIZE * 0.7;
      continue;
    }
    if (b.kind === "rule") {
      room(BODY_SIZE);
      ops.push(`0.75 w 0.7 G`);
      ops.push(`${PAGE_MARGIN.toFixed(2)} ${y.toFixed(2)} m ${(PAGE_WIDTH - PAGE_MARGIN).toFixed(2)} ${y.toFixed(2)} l S`);
      ops.push(`0 G`);
      y -= BODY_SIZE * 1.2;
      continue;
    }
    if (b.kind === "heading") {
      const size = b.level === 1 ? 14 : b.level === 2 ? 13 : 12;
      y -= size * 0.5;
      for (const l of wrapRuns(b.runs, size, maxWidth, 0, 0)) {
        room(size * 1.5);
        drawRuns(l.runs, PAGE_MARGIN, y, size);
        y -= size * 1.5;
      }
      y -= size * 0.2;
      continue;
    }
    if (b.kind === "list") {
      const indent = 14 + b.depth * 14;
      let first = true;
      for (const l of wrapRuns(b.runs, BODY_SIZE, maxWidth - indent - 16, indent + 16, indent + 16)) {
        room(lineH);
        if (first) {
          drawRuns([{ text: b.marker, bold: false }], indent, y, BODY_SIZE);
          first = false;
        }
        drawRuns(l.runs, l.indent, y, BODY_SIZE);
        y -= lineH;
      }
      continue;
    }
    if (b.kind === "table") {
      const pad = 6;
      const cellPad = 4;
      const columns = b.columns;
      const colWidth: number[] = [];
      for (let c = 0; c < columns; c++) {
        let w = textWidth(b.header[c] ?? "", BODY_SIZE, true);
        for (const row of b.rows) w = Math.max(w, textWidth(row[c] ?? "", BODY_SIZE, false));
        colWidth.push(w + pad * 2);
      }
      let total = colWidth.reduce((a, v) => a + v, 0);
      if (total > maxWidth) {
        const scale = maxWidth / total;
        for (let c = 0; c < columns; c++) colWidth[c] *= scale;
        total = colWidth.reduce((a, v) => a + v, 0);
      }
      const measure = (cells: string[], bold: boolean): number => {
        let maxLines = 1;
        for (let c = 0; c < columns; c++) {
          maxLines = Math.max(maxLines, wrapLine(cells[c] ?? "", BODY_SIZE, bold, colWidth[c] - pad * 2).length);
        }
        return maxLines * lineH + cellPad * 2;
      };
      const drawRow = (cells: string[], bold: boolean): void => {
        const rowH = measure(cells, bold);
        const top = y;
        const bottom = y - rowH;
        if (bold) {
          ops.push(`0.93 g`);
          ops.push(`${PAGE_MARGIN.toFixed(2)} ${bottom.toFixed(2)} ${total.toFixed(2)} ${rowH.toFixed(2)} re f`);
          ops.push(`0 g`);
        }
        let x = PAGE_MARGIN;
        for (let c = 0; c < columns; c++) {
          let cy = top - cellPad - BODY_SIZE;
          for (const cl of wrapLine(cells[c] ?? "", BODY_SIZE, bold, colWidth[c] - pad * 2)) {
            drawRuns([{ text: cl, bold }], x + pad, cy, BODY_SIZE);
            cy -= lineH;
          }
          x += colWidth[c];
        }
        ops.push(`0.6 w 0.7 G`);
        ops.push(`${PAGE_MARGIN.toFixed(2)} ${bottom.toFixed(2)} m ${(PAGE_MARGIN + total).toFixed(2)} ${bottom.toFixed(2)} l S`);
        ops.push(`${PAGE_MARGIN.toFixed(2)} ${top.toFixed(2)} m ${(PAGE_MARGIN + total).toFixed(2)} ${top.toFixed(2)} l S`);
        let vx = PAGE_MARGIN;
        for (let c = 0; c <= columns; c++) {
          ops.push(`${vx.toFixed(2)} ${bottom.toFixed(2)} m ${vx.toFixed(2)} ${top.toFixed(2)} l S`);
          if (c < columns) vx += colWidth[c];
        }
        ops.push(`0 G`);
        y = bottom;
      };
      const headerH = measure(b.header, true);
      if (y - headerH < PAGE_MARGIN && ops.length) newPage();
      drawRow(b.header, true);
      for (const row of b.rows) {
        const h = measure(row, false);
        if (y - h < PAGE_MARGIN && ops.length) {
          newPage();
          drawRow(b.header, true);
        }
        drawRow(row, false);
      }
      y -= BODY_SIZE * 0.4;
      continue;
    }
    // paragraph
    for (const l of wrapRuns(b.runs, BODY_SIZE, maxWidth, 0, 0)) {
      room(lineH);
      drawRuns(l.runs, PAGE_MARGIN, y, BODY_SIZE);
      y -= lineH;
    }
    y -= BODY_SIZE * 0.25;
  }
  flush();
  if (pages.length === 0) pages.push("");
  return buildPdf(pages);
}

function runsToHtml(runs: MdRun[]): string {
  return runs.map((r) => (r.bold ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text))).join("");
}

/** Render parsed markdown blocks as HTML (shared by answer and summary PDFs). */
function blocksToHtml(blocks: MdBlock[]): string {
  const out: string[] = [];
  let listOpen: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listOpen) {
      out.push(`</${listOpen}>`);
      listOpen = null;
    }
  };
  for (const b of blocks) {
    if (b.kind !== "list") closeList();
    switch (b.kind) {
      case "heading": {
        const lvl = Math.min(b.level, 3);
        out.push(`<h${lvl}>${runsToHtml(b.runs)}</h${lvl}>`);
        break;
      }
      case "para":
        out.push(`<p>${runsToHtml(b.runs)}</p>`);
        break;
      case "list": {
        const tag = /^\d/.test(b.marker) ? "ol" : "ul";
        if (listOpen !== tag) {
          closeList();
          out.push(`<${tag}>`);
          listOpen = tag;
        }
        out.push(`<li>${runsToHtml(b.runs)}</li>`);
        break;
      }
      case "table": {
        const head = `<thead><tr>${b.header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
        const body = `<tbody>${b.rows
          .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody>`;
        out.push(`<table>${head}${body}</table>`);
        break;
      }
      case "rule":
        out.push("<hr>");
        break;
      case "blank":
        break;
    }
  }
  closeList();
  return out.join("\n");
}

/** Markdown → HTML (used by the generic answer renderer). */
function markdownToHtml(src: string): string {
  return blocksToHtml(parseMarkdown(src));
}

/**
 * Heuristic: does this answer carry Markdown structure (table/heading/list/bold)
 * that the plain renderer would print as literal symbols? Used to auto-route the
 * default `.pdf` mode through the rich renderer.
 */
export function looksLikeMarkdown(text: string): boolean {
  return (
    /^\s*\|.*\|\s*$/m.test(text) ||
    /^#{1,6}\s+\S/m.test(text) ||
    /^\s*[-*]\s+\S/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text)
  );
}

const PDF_STYLE = `
  @page { size: A4; margin: 2.5cm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Inter", Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #171717; }
  h1 { font-family: "Inter", Arial, sans-serif; font-size: 15pt; margin: 0 0 1em; }
  h2 { font-size: 13pt; margin: 1.2em 0 0.5em; }
  h3 { font-size: 12pt; margin: 1em 0 0.4em; }
  p { margin: 0 0 0.6em; white-space: pre-wrap; }
  ul, ol { margin: 0 0 0.6em 1.4em; }
  li { margin: 0 0 0.2em; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 1em; }
  th, td { border: 1px solid #d4d4d4; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 1em 0; }
  .diagram-page { break-before: page; page-break-before: always; padding-top: 0.4cm; text-align: center; }
  .diagram-page h2 { margin: 0 0 0.8em; font-size: 13pt; }
  .diagram-page img { display: block; margin: 0 auto; max-width: 100%; max-height: 22cm; object-fit: contain; }
  .diagram-page figcaption { margin-top: 0.5em; color: #525252; font-size: 9.5pt; }
`;

const SUMMARY_TONE_HEX: Record<string, string> = {
  blue: "#0b6fd8",
  green: "#1f8a5b",
  amber: "#b7791f",
  violet: "#6b46c1",
  rose: "#b8325a",
  teal: "#0f766e",
};

const SUMMARY_TONES = ["blue", "green", "amber", "violet", "teal", "rose"];

function summaryTone(heading: string, index: number): string {
  const text = heading
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/visao geral|overview|introducao|contexto|resumo geral/.test(text)) return "blue";
  if (/topico|topicos|topico-chave|topicos-chave|fundamentos/.test(text)) return "green";
  if (/conceito|mais caem|conceitos que mais caem|definicoes/.test(text)) return "amber";
  if (/questao|questoes|questoes provaveis|prova|exame/.test(text)) return "violet";
  if (/dica|dicas|pegadinha|pegadinhas|atencao|erro|erros|revisao/.test(text)) return "rose";
  return SUMMARY_TONES[index % SUMMARY_TONES.length] ?? "blue";
}

interface SummarySection {
  heading: Extract<MdBlock, { kind: "heading" }> | null;
  blocks: MdBlock[];
}

function splitSummarySections(blocks: MdBlock[]): SummarySection[] {
  const sections: SummarySection[] = [];
  let current: SummarySection = { heading: null, blocks: [] };
  const meaningful = (blocks: MdBlock[]): boolean =>
    blocks.some((block) => block.kind !== "blank");
  for (const block of blocks) {
    if (block.kind === "heading" && block.level <= 2) {
      if (current.heading || meaningful(current.blocks)) sections.push(current);
      current = { heading: block, blocks: [] };
      continue;
    }
    current.blocks.push(block);
  }
  if (current.heading || meaningful(current.blocks)) sections.push(current);
  return sections;
}

/** A richer, study-oriented HTML for the Resumo (colors + section cards). */
function summaryMarkdownToHtml(markdown: string): string {
  const sections = splitSummarySections(parseMarkdown(markdown));
  const named = sections.filter((section) => section.heading);
  const toneByHeading = new Map<number, string>();
  named.forEach((section, index) => {
    const text = section.heading!.runs.map((run) => run.text).join(" ").trim();
    toneByHeading.set(index, summaryTone(text, index));
  });

  const toc = named.length >= 2
    ? `<nav class="toc">
  <div class="toc-title">Nesta matéria</div>
  <ol>${named
    .map((section, index) => {
      const text = section.heading!.runs.map((run) => run.text).join(" ").trim();
      const tone = toneByHeading.get(index) ?? "blue";
      return `<li><a href="#resumo-sec-${index}"><span class="toc-dot" style="background:${SUMMARY_TONE_HEX[tone]}"></span>${escapeHtml(text)}</a></li>`;
    })
    .join("")}</ol>
</nav>`
    : "";

  let sectionIndex = 0;
  const html = sections
    .map((section) => {
      if (!section.heading) {
        const body = blocksToHtml(section.blocks);
        return body.trim() ? `<div class="lead">${body}</div>` : "";
      }
      const headingText = section.heading.runs.map((run) => run.text).join(" ").trim();
      const tone = summaryTone(headingText, sectionIndex);
      const isQuestions = /quest/i.test(
        headingText.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      );
      const number = String(sectionIndex + 1).padStart(2, "0");
      const current = sectionIndex++;
      return `<section id="resumo-sec-${current}" class="section section--${tone}${isQuestions ? " section--questions" : ""}">
  <div class="section-head">
    <span class="section-num">${number}</span>
    <h2>${runsToHtml(section.heading.runs)}</h2>
  </div>
  <div class="section-body">${blocksToHtml(section.blocks)}</div>
</section>`;
    })
    .join("\n");

  return `${toc}${html}`;
}

const SUMMARY_PDF_STYLE = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Liberation Sans", "DejaVu Sans", Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.5; color: #1f2937; background: #ffffff;
  }
  .hero {
    background: linear-gradient(135deg, #0b4f9c 0%, #0b6fd8 58%, #3b9dff 100%);
    color: #fff; padding: 26px 22px 24px; border-radius: 0 0 20px 20px;
  }
  .hero-kicker {
    font-size: 8pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;
    color: rgba(255,255,255,.82);
  }
  .hero h1 {
    font-size: 23pt; line-height: 1.14; margin: 8px 0 12px;
    font-weight: 700; letter-spacing: -.02em;
  }
  .hero-meta { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 999px; font-size: 8pt;
    background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.24);
  }
  .toc {
    margin: 18px 0 10px; padding: 14px 16px 12px;
    border: 1px solid #e5e7eb; border-radius: 14px; background: #f8fafc;
  }
  .toc-title {
    font-size: 8.5pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: #6b7280; margin-bottom: 8px;
  }
  .toc ol {
    margin: 0; padding-left: 18px; columns: 2; column-gap: 26px;
    font-size: 9.5pt; color: #374151;
  }
  .toc li { margin: 0 0 4px; break-inside: avoid; }
  .toc a { color: #0b4f9c; text-decoration: none; }
  .toc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .lead { margin: 10px 0 14px; padding: 2px 2px 0; }
  .section {
    margin: 14px 0 0; border: 1px solid #e5e7eb; border-radius: 14px;
    background: #ffffff;
  }
  .section-head {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; background: var(--tone-soft);
    border-bottom: 1px solid #e5e7eb; break-after: avoid;
    border-radius: 13px 13px 0 0;
  }
  .section-num {
    width: 27px; height: 27px; border-radius: 9px; flex: 0 0 auto;
    display: flex; align-items: center; justify-content: center;
    background: var(--tone); color: #fff; font-size: 9pt; font-weight: 700;
  }
  .section-head h2 {
    margin: 0; font-size: 14pt; line-height: 1.25;
    color: var(--tone-ink); letter-spacing: -.01em;
  }
  .section-body { padding: 12px 16px 4px; border-radius: 0 0 13px 13px; }
  .section--blue { --tone:#0b6fd8; --tone-soft:#eaf3ff; --tone-ink:#0b4f9c; }
  .section--green { --tone:#1f8a5b; --tone-soft:#e9f7ef; --tone-ink:#176b47; }
  .section--amber { --tone:#b7791f; --tone-soft:#fff6e5; --tone-ink:#8a5a13; }
  .section--violet { --tone:#6b46c1; --tone-soft:#f3edff; --tone-ink:#53349a; }
  .section--rose { --tone:#b8325a; --tone-soft:#fdecf1; --tone-ink:#922747; }
  .section--teal { --tone:#0f766e; --tone-soft:#e6f7f5; --tone-ink:#0b5c55; }
  .section h3 {
    margin: 14px 0 6px; font-size: 11.5pt; line-height: 1.3;
    color: var(--tone-ink); break-after: avoid;
  }
  .section p { margin: 0 0 8px; }
  .section ul, .section ol { margin: 0 0 10px; padding-left: 20px; }
  .section li { margin: 0 0 4px; }
  .section li::marker { color: var(--tone); font-weight: 700; }
  .section-body strong {
    color: var(--tone-ink); background: var(--tone-soft);
    padding: 0 2px; border-radius: 3px;
  }
  .section table {
    width: 100%; border-collapse: separate; border-spacing: 0;
    margin: 8px 0 12px; font-size: 9.5pt; border: 1px solid #e5e7eb;
    border-radius: 8px; overflow: hidden;
  }
  .section thead { display: table-header-group; }
  .section th {
    background: var(--tone); color: #fff; text-align: left;
    padding: 7px 9px; font-size: 9pt;
  }
  .section td { padding: 6px 9px; border-top: 1px solid #e5e7eb; vertical-align: top; }
  .section tbody tr:nth-child(even) td { background: var(--tone-soft); }
  .section tr { break-inside: avoid; }
  .section blockquote {
    margin: 0 0 10px; padding: 8px 12px; border-left: 3px solid var(--tone);
    background: var(--tone-soft); color: #374151; border-radius: 0 8px 8px 0;
  }
  .section hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  .section code {
    font-family: "DejaVu Sans Mono", monospace; font-size: 9pt;
    background: #f3f4f6; padding: 0 3px; border-radius: 3px;
  }
  .section--questions .section-body { counter-reset: resumo-q; }
  .section--questions .section-body > ol,
  .section--questions .section-body > ul { list-style: none; padding-left: 0; }
  .section--questions .section-body > ol > li {
    counter-increment: resumo-q; position: relative;
    margin: 0 0 8px; padding: 9px 11px 9px 38px;
    border: 1px solid #e4d8fb; border-left: 4px solid #6b46c1;
    background: #fbf8ff; border-radius: 8px; break-inside: avoid;
  }
  .section--questions .section-body > ol > li::before {
    content: counter(resumo-q);
    position: absolute; left: 9px; top: 9px;
    width: 20px; height: 20px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    background: #6b46c1; color: #fff; font-size: 8.5pt; font-weight: 700;
  }
  .section--questions .section-body > ul > li {
    margin: 0 0 8px 28px; padding: 2px 0 2px 12px;
    border: 0; border-left: 2px solid #d9cdf5;
    background: transparent; border-radius: 0; color: #4b5563;
    break-inside: avoid;
  }
  .section--questions .section-body li ul,
  .section--questions .section-body li ol { margin-top: 6px; }
`;

function buildSummaryHtml(title: string, inner: string): string {
  const today = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${SUMMARY_PDF_STYLE}</style></head>
<body>
<header class="hero">
  <div class="hero-kicker">LXP Toolkit · Resumo de estudo</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="hero-meta">
    <span class="chip">${escapeHtml(today)}</span>
    <span class="chip">Material de revisão</span>
  </div>
</header>
<main class="content">
${inner}
</main>
</body></html>`;
}

const SUMMARY_PDF_VERSION = "3";

/** Cache directory for the study-summary PDFs. */
function summaryPdfCacheDir(): string {
  return assist("data", "summary-pdf");
}

/**
 * Render the study Resumo as a styled PDF: colored section cards, a table of
 * contents, good tables, highlighted key terms and a page footer.
 */
export async function summaryToPdf(markdown: string, title: string): Promise<string | null> {
  const cache = summaryPdfCacheDir();
  const key = createHash("sha256")
    .update(`${SUMMARY_PDF_VERSION}\n${title}\n${markdown}`)
    .digest("hex");
  const htmlPath = path.join(cache, `${key}.html`);
  const pdfPath = path.join(cache, `${key}.pdf`);
  if (existsSync(pdfPath)) return pdfPath;

  mkdirSync(cache, { recursive: true });
  const html = buildSummaryHtml(title, summaryMarkdownToHtml(markdown));
  writeFileSync(htmlPath, html, "utf-8");

  const footerTemplate = `<div style="width:100%; padding:0 14mm; font-family:Arial,sans-serif; font-size:7.5pt; color:#6b7280; display:flex; justify-content:space-between;">
  <span>${escapeHtml(title)} · LXP Toolkit</span>
  <span>página <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;

  const rendered = await renderHtmlPdfChromium(html, pdfPath, {
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate,
    margin: { top: "15mm", bottom: "18mm", left: "14mm", right: "14mm" },
    preferCSSPageSize: false,
    format: "A4",
  });
  if (rendered) return pdfPath;

  // Last-resort deterministic renderer (no Chromium): still readable, just
  // without the study colors.
  writeFileSync(pdfPath, renderRichPdf(title, markdown));
  return pdfPath;
}

export function buildAnswerHtml(
  baseName: string,
  inner: string,
  diagram?: PdfDiagram,
): string {
  const diagramHtml = diagram
    ? `<figure class="diagram-page">
  <h2>${escapeHtml(diagram.title ?? "Diagrama de caso de uso (UML)")}</h2>
  <img src="data:image/png;base64,${diagram.png.toString("base64")}" width="${diagram.width}" height="${diagram.height}" alt="${escapeHtml(diagram.title ?? "Diagrama de caso de uso (UML)")}" />
  <figcaption>${escapeHtml(diagram.title ?? "Diagrama de caso de uso (UML)")}</figcaption>
</figure>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(baseName)}</title>
<style>${PDF_STYLE}</style></head>
<body><h1>${escapeHtml(baseName)}</h1>${inner}${diagramHtml}</body></html>`;
}

interface ChromiumPdfOptions {
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  preferCSSPageSize?: boolean;
  format?: "A4";
}

/** Render HTML to PDF with Chromium (used when an image page is present). */
async function renderHtmlPdfChromium(
  html: string,
  out: string,
  options: ChromiumPdfOptions = {},
): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const noSandbox = /^(1|true|yes)$/i.test(process.env.PLAYWRIGHT_NO_SANDBOX ?? "");
    const browser = await chromium.launch({ args: noSandbox ? ["--no-sandbox"] : [] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: options.preferCSSPageSize ?? true,
        displayHeaderFooter: options.displayHeaderFooter === true,
        headerTemplate: options.headerTemplate ?? "<div></div>",
        footerTemplate: options.footerTemplate ?? "<div></div>",
        margin: options.margin,
        format: options.format,
      });
      writeFileSync(out, pdf);
      return true;
    } finally {
      await browser.close();
    }
  } catch {
    return false;
  }
}

/**
 * Render an answer to a PDF, cached by content + title + diagram.
 *
 * - Every answer uses Chromium's HTML→PDF engine. LibreOffice's HTML import can
 *   prepend a blank first page, so it is no longer used for answer PDFs.
 * - When a diagram is requested and Chromium fails, the whole render fails (the
 *   caller blocks the send) instead of silently producing a PDF without it.
 * - Text-only answers fall back to the built-in renderer (deterministic, no
 *   external process, no blank page).
 */
export async function answerToPdf(
  answer: string,
  baseName: string,
  opts: { rich?: boolean; diagram?: PdfDiagram } = {},
): Promise<string | null> {
  const rich = opts.rich === true || looksLikeMarkdown(answer);
  const diagram = opts.diagram;
  const cache = answerPdfCacheDir();
  const diagramHash = diagram
    ? createHash("sha256").update(diagram.png).digest("hex")
    : "none";
  const key = createHash("sha256")
    .update(`${PDF_RENDER_VERSION}\n${rich ? "rich" : "plain"}\n${baseName}\n${diagramHash}\n${answer}`)
    .digest("hex");
  const htmlPath = path.join(cache, `${key}.html`);
  const pdfPath = path.join(cache, `${key}.pdf`);
  if (existsSync(pdfPath)) return pdfPath;

  mkdirSync(cache, { recursive: true });
  const inner = rich
    ? markdownToHtml(answer)
    : answer
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p>&nbsp;</p>"))
        .join("\n");
  const html = buildAnswerHtml(baseName, inner, diagram);
  writeFileSync(htmlPath, html, "utf-8");

  if (await renderHtmlPdfChromium(html, pdfPath)) return pdfPath;
  // A diagram must render through the browser (full-quality embedded image).
  if (diagram) return null;

  writeFileSync(pdfPath, rich ? renderRichPdf(baseName, answer) : renderTextPdf(baseName, answer));
  return pdfPath;
}

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

/** Markdown → HTML for the LibreOffice path (styled tables/lists/headings). */
function markdownToHtml(src: string): string {
  const blocks = parseMarkdown(src);
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

/**
 * Render an answer to a PDF, cached by content + title. Uses LibreOffice when
 * available (styled HTML output) and otherwise falls back to the built-in
 * renderer, so `.pdf` delivery works without LibreOffice.
 *
 * `rich` (the "fill" send mode) preserves headings/lists/tables/bold; the
 * default is the plain line-by-line layout.
 */
export async function answerToPdf(
  answer: string,
  baseName: string,
  opts: { rich?: boolean } = {},
): Promise<string | null> {
  const rich = opts.rich === true;
  const cache = answerPdfCacheDir();
  const key = createHash("sha256").update(`${rich ? "rich" : "plain"}\n${baseName}\n${answer}`).digest("hex");
  const htmlPath = path.join(cache, `${key}.html`);
  const pdfPath = path.join(cache, `${key}.pdf`);
  if (existsSync(pdfPath)) return pdfPath;

  mkdirSync(cache, { recursive: true });
  if (!existsSync(htmlPath)) {
    const inner = rich
      ? markdownToHtml(answer)
      : answer
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
  h2 { font-size: 13pt; margin: 1.2em 0 0.5em; }
  h3 { font-size: 12pt; margin: 1em 0 0.4em; }
  p { margin: 0 0 0.6em; white-space: pre-wrap; }
  ul, ol { margin: 0 0 0.6em 1.4em; }
  li { margin: 0 0 0.2em; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 1em; }
  th, td { border: 1px solid #b9c0c9; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #eef1f4; }
  hr { border: none; border-top: 1px solid #c9ced6; margin: 1em 0; }
</style></head>
<body><h1>${escapeHtml(baseName)}</h1>${inner}</body></html>`;
    writeFileSync(htmlPath, html, "utf-8");
  }

  const converted = await officeToPdf(htmlPath, cache);
  if (converted) return converted;

  writeFileSync(pdfPath, rich ? renderRichPdf(baseName, answer) : renderTextPdf(baseName, answer));
  return pdfPath;
}

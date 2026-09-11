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

/**
 * Render a plain-text answer to a PDF (HTML → LibreOffice → PDF), cached by
 * content + title. Returns the absolute PDF path, or null when conversion
 * fails (e.g. LibreOffice not installed).
 */
export async function answerToPdf(answer: string, baseName: string): Promise<string | null> {
  const cache = answerPdfCacheDir();
  const key = createHash("sha256").update(`${baseName}\n${answer}`).digest("hex");
  const htmlPath = path.join(cache, `${key}.html`);
  const pdfPath = path.join(cache, `${key}.pdf`);
  if (existsSync(pdfPath)) return pdfPath;

  if (!existsSync(htmlPath)) {
    mkdirSync(cache, { recursive: true });
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

  return officeToPdf(htmlPath, cache);
}

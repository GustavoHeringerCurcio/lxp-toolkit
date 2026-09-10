import { readFileSync } from "node:fs";
import { isOfficeFile, officeToPdf } from "./office.js";

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

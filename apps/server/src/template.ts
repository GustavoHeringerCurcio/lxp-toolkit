import { readFileSync } from "node:fs";
import JSZip from "jszip";

/**
 * A field of a professor-provided model (e.g. the "Modelo de Caso de Uso"
 * table): the row label and its placeholder value. Used to ground generation
 * in the exact template the student must fill.
 */
export interface TemplateField {
  label: string;
  value: string;
}

export interface DocxTemplate {
  /** Absolute path of the source .docx. */
  path: string;
  fields: TemplateField[];
}

/** True when a filename is a Word document we can inspect. */
export function isDocxFile(name: string): boolean {
  return /\.docx$/i.test(name.split(/[?#]/)[0]);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Concatenate every `<w:t>` run inside a cell/paragraph fragment. */
function runText(fragment: string): string {
  const parts = [...fragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
    decodeEntities(m[1]),
  );
  return parts.join("").replace(/\s+/g, " ").trim();
}

/**
 * Parse the first table of a `word/document.xml` document into `{label, value}`
 * rows. Only the first two columns are used (the model is a 2-column table).
 * Returns null when there is no table or no usable rows.
 */
export function extractFirstTableFields(xml: string): TemplateField[] | null {
  const table = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  if (!table) return null;
  const rows = table[0].match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
  const fields: TemplateField[] = [];
  for (const row of rows) {
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
    if (cells.length < 2) continue;
    const label = runText(cells[0] ?? "");
    const value = runText(cells[1] ?? "");
    if (label) fields.push({ label, value });
  }
  return fields.length ? fields : null;
}

/**
 * Read a `.docx` and return its first table as template fields. Returns null for
 * anything that isn't a readable Word document with a table.
 */
export async function readDocxTemplate(absPath: string): Promise<DocxTemplate | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(readFileSync(absPath));
  } catch {
    return null;
  }
  const doc = zip.file("word/document.xml");
  if (!doc) return null;
  let xml: string;
  try {
    xml = await doc.async("string");
  } catch {
    return null;
  }
  const fields = extractFirstTableFields(xml);
  return fields ? { path: absPath, fields } : null;
}

/**
 * Locate the professor's model among a task's local attachments: the first
 * `.docx` whose first table yields fields. Returns null when there is none.
 */
export async function findTemplateDocx(
  files: { name: string; absPath: string }[],
): Promise<DocxTemplate | null> {
  for (const file of files) {
    if (!isDocxFile(file.name)) continue;
    const template = await readDocxTemplate(file.absPath).catch(() => null);
    if (template && template.fields.length) return template;
  }
  return null;
}

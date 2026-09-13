import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { extractFirstTable } from "./template.js";
import { normalizeLabel, useCaseName, type UseCase } from "./usecase.js";

/**
 * Build a filled copy of a professor-provided `.docx` model: the template's
 * first table is cloned once per use case and its value cells are replaced.
 * Optionally embeds a UML diagram PNG after the tables.
 *
 * The template's XML is edited in place (only `word/document.xml`, plus the
 * image relationship/content-type when a diagram is present) so all of its
 * styles and formatting survive.
 */

const IMAGE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const EMU_PER_PX = 9525;
const MAX_IMAGE_WIDTH_EMU = 5_486_400; // 6 inches

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowsOf(table: string): string[] {
  return table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
}

function cellsOf(row: string): string[] {
  return row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
}

function cellProps(cell: string): { tcPr: string; pPr: string } {
  return {
    tcPr: cell.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0] ?? "",
    pPr: cell.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? "",
  };
}

/** One value cell: keeps the template's cell/paragraph properties, new text. */
function buildCell(tcPr: string, pPr: string, value: string): string {
  const runs = value
    .split("\n")
    .map((line, i) => `<w:r>${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)
    .join("");
  return `<w:tc>${tcPr}<w:p>${pPr}${runs}</w:p></w:tc>`;
}

function headingParagraph(text: string): string {
  return (
    `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
  );
}

/** Clone the table and fill the value column from `fields` (keyed by label). */
function fillTable(table: string, labels: string[], fields: Record<string, string>): string {
  const rows = rowsOf(table);
  if (!rows.length) return table;
  const first = table.indexOf(rows[0]);
  const lastEnd = table.lastIndexOf("</w:tr>") + "</w:tr>".length;
  const head = table.slice(0, first);
  const tail = table.slice(lastEnd);
  const filled = rows
    .map((row, i) => {
      const cells = cellsOf(row);
      if (cells.length < 2) return row;
      const label = labels[i];
      const value = label ? fields[normalizeLabel(label)] ?? "" : "";
      const { tcPr, pPr } = cellProps(cells[1]);
      const at = row.indexOf(cells[1]);
      return row.slice(0, at) + buildCell(tcPr, pPr, value) + row.slice(at + cells[1].length);
    })
    .join("");
  return head + filled + tail;
}

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function diagramParagraph(relId: string, png: Buffer): string {
  const size = pngSize(png) ?? { width: 800, height: 600 };
  let cx = size.width * EMU_PER_PX;
  let cy = size.height * EMU_PER_PX;
  if (cx > MAX_IMAGE_WIDTH_EMU) {
    cy = Math.round(cy * (MAX_IMAGE_WIDTH_EMU / cx));
    cx = MAX_IMAGE_WIDTH_EMU;
  }
  return (
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="120"/></w:pPr>` +
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Diagrama de Caso de Uso"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="diagram.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

function nextRelId(rels: string): string {
  const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

function addImageRel(rels: string, id: string, target: string): string {
  const rel = `<Relationship Id="${id}" Type="${IMAGE_REL_TYPE}" Target="${target}"/>`;
  return rels.includes("</Relationships>")
    ? rels.replace("</Relationships>", `${rel}</Relationships>`)
    : rels;
}

function ensurePngContentType(xml: string): string {
  if (/Extension="png"/i.test(xml)) return xml;
  return xml.replace(/<Types\b[^>]*>/, (m) => `${m}<Default Extension="png" ContentType="image/png"/>`);
}

/**
 * Render a filled `.docx` buffer. Throws when the template has no table.
 */
export async function renderFilledDocx(
  templatePath: string,
  labels: string[],
  useCases: UseCase[],
  diagramPng: Buffer | null,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(readFileSync(templatePath));
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) throw new Error("modelo .docx sem word/document.xml");
  let xml = await docEntry.async("string");

  const table = extractFirstTable(xml);
  if (!table) throw new Error("modelo .docx sem tabela para preencher");

  const generated = useCases
    .map(
      (uc) =>
        headingParagraph(`Caso de Uso ${uc.id} — ${useCaseName(uc)}`) +
        fillTable(table, labels, uc.fields),
    )
    .join("");

  const startTag = "<w:body>";
  const endTag = "</w:body>";
  const bodyStart = xml.indexOf(startTag);
  const bodyEnd = xml.indexOf(endTag);
  if (bodyStart < 0 || bodyEnd < 0) throw new Error("document.xml sem <w:body>");
  const start = bodyStart + startTag.length;
  let body = xml.slice(start, bodyEnd);

  const at = body.indexOf(table);
  if (at < 0) throw new Error("tabela do modelo não encontrada no corpo");
  body = body.slice(0, at) + generated + body.slice(at + table.length);

  if (diagramPng) {
    const relsEntry = zip.file("word/_rels/document.xml.rels");
    if (relsEntry) {
      const rels = await relsEntry.async("string");
      const relId = nextRelId(rels);
      zip.file("word/_rels/document.xml.rels", addImageRel(rels, relId, "media/diagram.png"));
      body += headingParagraph("Diagrama de Caso de Uso (UML)") + diagramParagraph(relId, diagramPng);
    }
    const ctEntry = zip.file("[Content_Types].xml");
    if (ctEntry) {
      zip.file("[Content_Types].xml", ensurePngContentType(await ctEntry.async("string")));
    }
    zip.file("word/media/diagram.png", diagramPng);
  }

  xml = xml.slice(0, start) + body + xml.slice(bodyEnd);
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

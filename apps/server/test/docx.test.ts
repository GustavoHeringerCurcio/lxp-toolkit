import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderFilledDocx } from "../src/docx.js";
import { extractFirstTableFields } from "../src/template.js";
import type { UseCase } from "../src/usecase.js";

const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>
<w:p><w:r><w:t>Modelo de Caso de Uso</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblStyle w:val="Tabelacomgrade"/></w:tblPr><w:tblGrid><w:gridCol w:w="4315"/><w:gridCol w:w="4315"/></w:tblGrid>
<w:tr><w:tc><w:tcPr><w:tcW w:w="4315" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:t>Identificador</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4315" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:t>UC-XX</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:tcPr><w:tcW w:w="4315" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:t>Nome do Caso de Uso</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4315" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:t>.</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:tcPr><w:tcW w:w="4315" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Fluxo Principal</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4315" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>.</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl><w:sectPr/></w:body></w:document>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

let dir: string;
let templatePath: string;

async function template(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("word/document.xml", DOC_XML);
  zip.file("word/_rels/document.xml.rels", RELS);
  return zip.generateAsync({ type: "nodebuffer" });
}

function fakePng(width = 120, height = 90): Buffer {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const LABELS = ["Identificador", "Nome do Caso de Uso", "Fluxo Principal"];

const cases: UseCase[] = [
  {
    id: "UC-01",
    name: "Realizar Agendamento de Consulta",
    fields: {
      identificador: "UC-01",
      "nome do caso de uso": "Realizar Agendamento de Consulta",
      "fluxo principal": "1. Acessa o sistema\n2. Seleciona paciente",
    },
  },
  {
    id: "UC-02",
    name: "Cancelar Consulta",
    fields: { identificador: "UC-02", "nome do caso de uso": "Cancelar Consulta" },
  },
];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "lxp-docx-"));
  templatePath = path.join(dir, "Modelo.docx");
  writeFileSync(templatePath, await template());
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("renderFilledDocx", () => {
  it("clona a tabela por caso de uso e preenche as células", async () => {
    const out = await renderFilledDocx(templatePath, LABELS, cases, null);
    const zip = await JSZip.loadAsync(out);
    const xml = await zip.file("word/document.xml")!.async("string");

    expect((xml.match(/<w:tbl>/g) ?? []).length).toBe(2);
    expect(xml).toContain("Caso de Uso UC-01 — Realizar Agendamento de Consulta");
    expect(xml).toContain("Caso de Uso UC-02 — Cancelar Consulta");
    expect(xml).toContain("UC-01");
    expect(xml).toContain("Cancelar Consulta");
    expect(xml).not.toContain("UC-XX");
    expect(xml).toContain("1. Acessa o sistema");
    expect(xml).toContain("<w:br/>");
    // The table fields are still detectable in the produced document.
    expect(extractFirstTableFields(xml)?.length).toBe(3);
  });

  it("embute o diagrama e o relacionamento de imagem", async () => {
    const out = await renderFilledDocx(templatePath, LABELS, cases, fakePng());
    const zip = await JSZip.loadAsync(out);
    expect(zip.file("word/media/diagram.png")).toBeTruthy();
    const xml = await zip.file("word/document.xml")!.async("string");
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(xml).toContain('r:embed="rId1"');
    expect(xml).toContain("Diagrama de Caso de Uso (UML)");
    expect(rels).toContain('Id="rId1"');
    expect(rels).toContain("media/diagram.png");
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    expect(ct).toContain('Extension="png"');
  });
});

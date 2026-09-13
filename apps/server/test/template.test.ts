import { describe, expect, it } from "vitest";
import { extractFirstTableFields, isDocxFile } from "../src/template.js";

const XML = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Modelo de Caso de Uso</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblStyle w:val="Tabelacomgrade"/></w:tblPr>
<w:tr><w:tc><w:p><w:r><w:t>Identificador</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>UC-</w:t></w:r><w:r><w:t>XX</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Descri&#231;&#227;o / Objetivo</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>.</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Fluxo Principal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>&amp;</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl></w:body></w:document>`;

describe("extractFirstTableFields", () => {
  it("extrai rótulo e valor de cada linha da primeira tabela", () => {
    expect(extractFirstTableFields(XML)).toEqual([
      { label: "Identificador", value: "UC-XX" },
      { label: "Descrição / Objetivo", value: "." },
      { label: "Fluxo Principal", value: "&" },
    ]);
  });

  it("retorna null quando não há tabela", () => {
    expect(extractFirstTableFields("<w:document></w:document>")).toBeNull();
    expect(extractFirstTableFields("<w:tbl><w:tr></w:tr></w:tbl>")).toBeNull();
  });
});

describe("isDocxFile", () => {
  it("reconhece .docx (case-insensitive)", () => {
    expect(isDocxFile("Modelo_Caso_de_Uso.docx")).toBe(true);
    expect(isDocxFile("modelo.DOCX")).toBe(true);
    expect(isDocxFile("Resumo.pdf")).toBe(false);
  });
});

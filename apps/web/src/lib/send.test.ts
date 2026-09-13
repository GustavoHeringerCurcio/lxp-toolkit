import { describe, expect, it } from "vitest";
import { defaultSendMode, hasDocxTemplate } from "./send";

describe("hasDocxTemplate", () => {
  it("detecta .docx ignorando caixa", () => {
    expect(hasDocxTemplate([{ filename: "Modelo_Caso_de_Uso.docx" }])).toBe(true);
    expect(hasDocxTemplate([{ filename: "MODELO.DOCX" }])).toBe(true);
  });

  it("retorna false sem .docx", () => {
    expect(hasDocxTemplate([{ filename: "resumo.pdf" }, { filename: null }])).toBe(false);
    expect(hasDocxTemplate([])).toBe(false);
  });
});

describe("defaultSendMode", () => {
  it("usa docx quando a atividade traz um modelo .docx", () => {
    expect(defaultSendMode({ kind: "upload", remoteFiles: [{ filename: "Modelo.docx" }] })).toBe("docx");
  });

  it("usa text sem modelo ou fora de upload", () => {
    expect(defaultSendMode({ kind: "upload", remoteFiles: [{ filename: "a.pdf" }] })).toBe("text");
    expect(defaultSendMode({ kind: "quiz", remoteFiles: [{ filename: "a.docx" }] })).toBe("text");
  });
});

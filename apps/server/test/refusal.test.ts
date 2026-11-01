import { describe, expect, it } from "vitest";
import { detectRefusal } from "../src/ai.js";

describe("detectRefusal", () => {
  it("detects the common file/link refusal forms", () => {
    expect(
      detectRefusal("Infelizmente, não posso acessar o conteúdo dos arquivos ou links fornecidos."),
    ).toBe(true);
    expect(detectRefusal("Você precisará abrir os arquivos mencionados.")).toBe(true);
    expect(detectRefusal("I cannot access the attached files.")).toBe(true);
  });

  it("does not flag a normal answer", () => {
    expect(detectRefusal("Segue a lista de tabelas do exercício a e b.")).toBe(false);
  });
});

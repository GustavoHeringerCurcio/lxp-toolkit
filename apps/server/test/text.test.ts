import { describe, expect, it } from "vitest";
import { composeUploadBaseName, humanizeActivityTitle } from "../src/text.js";

describe("humanizeActivityTitle", () => {
  it("turns underscore/URL separators into readable spaces", () => {
    expect(humanizeActivityTitle("ATIVADE_X_Y_Z")).toBe("ATIVADE X Y Z");
    expect(humanizeActivityTitle("Exercícios_Unidade 1")).toBe("Exercícios Unidade 1");
    expect(humanizeActivityTitle("Aula_03")).toBe("Aula 03");
  });

  it("decodes URL escapes and collapses whitespace", () => {
    expect(humanizeActivityTitle("Laborat%C3%B3rio%20Aula_7")).toBe("Laboratório Aula 7");
    expect(humanizeActivityTitle("  dois   espaços  ")).toBe("dois espaços");
  });

  it("does not throw on malformed escapes", () => {
    expect(humanizeActivityTitle("100%_pronto")).toBe("100% pronto");
  });

  it("handles empty input", () => {
    expect(humanizeActivityTitle("")).toBe("");
    expect(humanizeActivityTitle(null)).toBe("");
  });
});

describe("composeUploadBaseName", () => {
  it("joins the student name and activity with a human separator", () => {
    expect(composeUploadBaseName("Gustavo Heringer Curcio", "Exercícios_Unidade 1")).toBe(
      "Gustavo Heringer Curcio - Exercícios Unidade 1",
    );
  });

  it("never returns a dangling separator", () => {
    expect(composeUploadBaseName("Gustavo", "")).toBe("Gustavo");
    expect(composeUploadBaseName("", "Atividade_X")).toBe("Atividade X");
    expect(composeUploadBaseName(null, null)).toBe("");
  });
});

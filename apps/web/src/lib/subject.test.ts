import { describe, expect, it } from "vitest";
import { subjectIndex, subjectInitials, subjectStyle } from "./subject";

describe("subjectIndex", () => {
  it("é determinístico para o mesmo módulo", () => {
    expect(subjectIndex("Cálculo")).toBe(subjectIndex("Cálculo"));
  });

  it("sempre cai na paleta de 8 slots", () => {
    for (const name of ["Cálculo", "Álgebra Linear", "Programação", "Física", "Estatística", ""]) {
      const i = subjectIndex(name);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(8);
    }
  });
});

describe("subjectStyle", () => {
  it("aponta para o token --subject-N (1-based)", () => {
    const style = subjectStyle("Cálculo") as Record<string, string>;
    expect(style["--subj"]).toBe(`var(--subject-${subjectIndex("Cálculo") + 1})`);
  });
});

describe("subjectInitials", () => {
  it("usa duas letras para uma palavra", () => {
    expect(subjectInitials("Programação")).toBe("PR");
  });

  it("usa as iniciais de duas palavras", () => {
    expect(subjectInitials("Álgebra Linear")).toBe("ÁL");
  });

  it("ignora conectivos em pt-BR", () => {
    expect(subjectInitials("Introdução à Programação")).toBe("IP");
    expect(subjectInitials("Teoria dos Grafos")).toBe("TG");
  });

  it("trata vazio", () => {
    expect(subjectInitials("")).toBe("?");
    expect(subjectInitials(null)).toBe("?");
  });
});

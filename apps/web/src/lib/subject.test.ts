import { describe, expect, it } from "vitest";
import {
  assignSubjectIndices,
  subjectCount,
  subjectIndex,
  subjectInitials,
  subjectStyle,
  subjectStyleForIndex,
} from "./subject";

describe("subjectIndex", () => {
  it("é determinístico para o mesmo módulo", () => {
    expect(subjectIndex("Cálculo")).toBe(subjectIndex("Cálculo"));
  });

  it("sempre cai na paleta de slots", () => {
    for (const name of ["Cálculo", "Álgebra Linear", "Programação", "Física", "Estatística", ""]) {
      const i = subjectIndex(name);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(subjectCount());
    }
  });
});

describe("assignSubjectIndices", () => {
  it("dá cores distintas a módulos que colidiriam no hash", () => {
    const map = assignSubjectIndices(["Projeto", "Desenvolvimento Back-end"]);
    expect(map.get("Projeto")).not.toBe(map.get("Desenvolvimento Back-end"));
  });

  it("mantém todos os módulos dentro da paleta", () => {
    const names = ["Cálculo", "Programação", "Banco de Dados", "Física", "Estatística"];
    const map = assignSubjectIndices(names);
    for (const name of names) {
      const slot = map.get(name);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(subjectCount());
    }
  });

  it("não repete slots enquanto houver cores suficientes", () => {
    const names = Array.from({ length: subjectCount() }, (_, i) => `Módulo ${i}`);
    const slots = [...assignSubjectIndices(names).values()];
    expect(new Set(slots).size).toBe(names.length);
  });

  it("é determinístico e ignora a ordem de entrada", () => {
    const a = assignSubjectIndices(["Projeto", "Banco de Dados", "Cálculo"]);
    const b = assignSubjectIndices(["Cálculo", "Projeto", "Banco de Dados"]);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

describe("subjectStyle", () => {
  it("aponta para o token --subject-N (1-based)", () => {
    const style = subjectStyle("Cálculo") as Record<string, string>;
    expect(style["--subj"]).toBe(`var(--subject-${subjectIndex("Cálculo") + 1})`);
  });

  it("subjectStyleForIndex normaliza índices fora da faixa", () => {
    const style = subjectStyleForIndex(subjectCount()) as Record<string, string>;
    expect(style["--subj"]).toBe("var(--subject-1)");
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

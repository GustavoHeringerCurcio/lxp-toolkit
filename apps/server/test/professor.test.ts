import { describe, expect, it } from "vitest";
import {
  matchProfessor,
  normalizeName,
  professorFromModuleTitle,
  teachersFromContext,
  toDisplayName,
  type Teacher,
} from "../src/professor.js";

const TEACHERS: Teacher[] = [
  { safeaUserId: 5723877, userId: 8346005, externalUserId: "d72d", name: "DEBORA AMORIM DE CARVALHO" },
  { safeaUserId: 12167264, userId: 8517857, externalUserId: "705c", name: "LEONARDO DIAS DA SILVA" },
  { safeaUserId: 1733436, userId: 7503700, externalUserId: "7d2d", name: "MARCELO PASSOS DOS SANTOS" },
  { safeaUserId: 1715709, userId: 7503697, externalUserId: "5236", name: "OSNI AUGUSTO SOUZA DA SILVA" },
  { safeaUserId: 5996976, userId: 8405199, externalUserId: "22ea", name: "RAFAEL IACILLO SOARES" },
];

describe("normalizeName", () => {
  it("remove títulos, acentos e caixa", () => {
    expect(normalizeName("Profa. Débora Amorim")).toBe("debora amorim");
    expect(normalizeName("Prof. Osni Silva")).toBe("osni silva");
  });
});

describe("toDisplayName", () => {
  it("formata o nome bruto do portal", () => {
    expect(toDisplayName("DEBORA AMORIM DE CARVALHO")).toBe("Debora Amorim De Carvalho");
  });
});

describe("professorFromModuleTitle", () => {
  it("extrai o sufixo ' - Prof. Nome'", () => {
    expect(professorFromModuleTitle("Banco de Dados I - Profa. Débora Amorim")).toBe("Profa. Débora Amorim");
    expect(professorFromModuleTitle("Projeto - Prof. Marcelo Passos")).toBe("Prof. Marcelo Passos");
  });
  it("devolve null quando não há sufixo de professor", () => {
    expect(professorFromModuleTitle("Material Didático")).toBeNull();
  });
});

describe("matchProfessor", () => {
  it("resolve o sufixo curto para o safeaUserId estável", () => {
    const cases: [string, number][] = [
      ["Profa. Débora Amorim", 5723877],
      ["Prof. Leonardo Dias", 12167264],
      ["Prof. Marcelo Passos", 1733436],
      ["Prof. Osni Silva", 1715709],
      ["Prof. Rafael Iacillo", 5996976],
    ];
    for (const [suffix, id] of cases) {
      const match = matchProfessor(suffix, TEACHERS);
      expect(match.professorId, suffix).toBe(id);
      expect(match.confidence).toBe(1);
    }
  });

  it("não casa quando nenhum token bate", () => {
    expect(matchProfessor("Prof. Fulano Beltrano", TEACHERS).professorId).toBeNull();
  });

  it("devolve null sem sufixo ou sem professores", () => {
    expect(matchProfessor(null, TEACHERS).professorId).toBeNull();
    expect(matchProfessor("Prof. Osni Silva", []).professorId).toBeNull();
  });
});

describe("teachersFromContext", () => {
  it("lê o array course-wide de professores", () => {
    const teachers = teachersFromContext({
      teachers: [
        { safeaUserId: 1, userId: 2, externalUserId: "x", name: " A B " },
        { name: "sem id" },
      ],
    });
    expect(teachers).toEqual([{ safeaUserId: 1, userId: 2, externalUserId: "x", name: "A B" }]);
  });

  it("tolera context ausente", () => {
    expect(teachersFromContext(null)).toEqual([]);
  });
});

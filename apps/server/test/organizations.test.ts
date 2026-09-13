import { describe, expect, it } from "vitest";
import { linkedinAvatarUrl } from "../src/linkedin.js";
import { loadOrganizations, matchProfessorRow, type ProfessorLite } from "../src/organizations.js";

const PROFESSORS: ProfessorLite[] = [
  { id: 5723877, display: "Debora Amorim De Carvalho", full: "DEBORA AMORIM DE CARVALHO" },
  { id: 12167264, display: "Leonardo Dias Da Silva", full: "LEONARDO DIAS DA SILVA" },
  { id: 5996976, display: "Rafael Iacillo Soares", full: "RAFAEL IACILLO SOARES" },
  { id: 1733436, display: "Marcelo Passos Dos Santos", full: "MARCELO PASSOS DOS SANTOS" },
  { id: 1715709, display: "Osni Augusto Souza Da Silva", full: "OSNI AUGUSTO SOUZA DA SILVA" },
];

describe("loadOrganizations", () => {
  it("lê o diretório hardcoded da UNIFOA", () => {
    const orgs = loadOrganizations();
    const unifoa = orgs.find((o) => o.id === "unifoa");
    expect(unifoa).toBeDefined();
    expect(unifoa?.name).toBe("UNIFOA");
    expect(unifoa?.logo).toContain("bucket.safea.grupoa.education");
    expect(unifoa?.professors.length).toBe(5);
  });
});

describe("matchProfessorRow", () => {
  it("casa por nome normalizado (acentos e caixa)", () => {
    const match = matchProfessorRow(
      { name: "Debora Amorim de Carvalho", linkedin: "x" },
      PROFESSORS,
    );
    expect(match?.professor.id).toBe(5723877);
    expect(match?.confidence).toBe("exact");
  });

  it("aceita subconjunto de tokens como provável", () => {
    const match = matchProfessorRow({ name: "Rafael Iacillo", linkedin: "x" }, PROFESSORS);
    expect(match?.professor.id).toBe(5996976);
    expect(match?.confidence).toBe("probable");
  });

  it("respeita o pin por professorId", () => {
    const match = matchProfessorRow(
      { name: "Nome Errado", linkedin: "x", professorId: 1715709 },
      PROFESSORS,
    );
    expect(match?.professor.id).toBe(1715709);
    expect(match?.confidence).toBe("exact");
  });

  it("devolve null quando não há correspondência", () => {
    expect(matchProfessorRow({ name: "Fulano Beltrano", linkedin: "x" }, PROFESSORS)).toBeNull();
  });
});

describe("linkedinAvatarUrl", () => {
  it("converte o perfil em URL do unavatar", () => {
    expect(linkedinAvatarUrl("https://www.linkedin.com/in/osni-silva-segtecinfo/")).toBe(
      "https://unavatar.io/linkedin/osni-silva-segtecinfo",
    );
  });

  it("devolve null para valor inválido", () => {
    expect(linkedinAvatarUrl("não é um perfil")).toBeNull();
  });
});

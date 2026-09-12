import { describe, expect, it } from "vitest";
import { professorInitials, professorLabel } from "./prof";

describe("professorLabel", () => {
  it("remove o prefixo Prof./Profa.", () => {
    expect(professorLabel("Prof. Leonardo Dias")).toBe("Leonardo Dias");
    expect(professorLabel("Profa. Débora Amorim")).toBe("Débora Amorim");
  });

  it("mantém nomes sem prefixo", () => {
    expect(professorLabel("Osni Silva")).toBe("Osni Silva");
  });
});

describe("professorInitials", () => {
  it("usa a primeira e a última palavra", () => {
    expect(professorInitials("Prof. Leonardo Dias")).toBe("LD");
    expect(professorInitials("Profa. Débora Amorim")).toBe("DA");
  });

  it("usa duas letras para um nome único", () => {
    expect(professorInitials("Osni")).toBe("OS");
  });

  it("trata vazio", () => {
    expect(professorInitials("")).toBe("?");
    expect(professorInitials(null)).toBe("?");
  });
});

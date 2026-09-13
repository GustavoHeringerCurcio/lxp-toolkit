import { describe, expect, it } from "vitest";
import { parseFlavorClassification } from "../src/classify.js";

describe("parseFlavorClassification", () => {
  it("aceita payload válido", () => {
    expect(parseFlavorClassification('{"flavor":"ghost","reason":"roteiro"}')).toEqual({
      flavor: "ghost",
      reason: "roteiro",
    });
  });

  it("normaliza maiúsculas e espaços", () => {
    expect(parseFlavorClassification('{"flavor":" Print ","reason":""}')).toEqual({
      flavor: "print",
      reason: "",
    });
  });

  it("rejeita flavor desconhecido", () => {
    expect(parseFlavorClassification('{"flavor":"banana"}')).toBeNull();
  });

  it("rejeita JSON inválido", () => {
    expect(parseFlavorClassification("not json")).toBeNull();
  });

  it("rejeita array", () => {
    expect(parseFlavorClassification("[]")).toBeNull();
  });

  it("trunca motivo longo", () => {
    const reason = "x".repeat(500);
    const parsed = parseFlavorClassification(`{"flavor":"question","reason":"${reason}"}`);
    expect(parsed?.reason.length).toBe(300);
  });
});

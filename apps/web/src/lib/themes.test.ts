import { describe, expect, it } from "vitest";
import { composeContextInstructions, parseContextInstructions } from "./themes";

describe("composeContextInstructions / parseContextInstructions", () => {
  it("round-trips theme, actors and requirements", () => {
    const instructions = composeContextInstructions({
      theme: "Loja Virtual",
      atores: ["Cliente", "Administrador"],
      requisitos: ["Cadastro de produtos", "Carrinho de compras"],
    });
    expect(parseContextInstructions(instructions)).toEqual({
      theme: "Loja Virtual",
      atores: ["Cliente", "Administrador"],
      requisitos: ["Cadastro de produtos", "Carrinho de compras"],
    });
  });

  it("parses a partial context (theme only)", () => {
    expect(parseContextInstructions(composeContextInstructions({
      theme: "Blog Dinâmico",
      atores: [],
      requisitos: [],
    }))).toEqual({ theme: "Blog Dinâmico", atores: [], requisitos: [] });
  });

  it("returns null for free-form instructions and empty input", () => {
    expect(parseContextInstructions("seja breve e cite as fontes")).toBeNull();
    expect(parseContextInstructions("")).toBeNull();
    expect(parseContextInstructions(null)).toBeNull();
    expect(parseContextInstructions(undefined)).toBeNull();
  });

  it("reads legacy JSON overrides", () => {
    const raw = JSON.stringify({ prompt: "Contexto do projeto: API Climática." });
    expect(parseContextInstructions(raw)).toEqual({
      theme: "API Climática",
      atores: [],
      requisitos: [],
    });
  });
});

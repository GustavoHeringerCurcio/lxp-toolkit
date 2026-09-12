import { afterEach, describe, expect, it } from "vitest";
import { openaiKey } from "../src/config.js";

const REAL_KEY = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (REAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = REAL_KEY;
});

describe("openaiKey", () => {
  it("lança erro quando a chave não está configurada", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => openaiKey()).toThrow(/OPENAI_API_KEY não configurada/);
  });

  it("lança erro com o placeholder do .env.example", () => {
    process.env.OPENAI_API_KEY = "sk-...";
    expect(() => openaiKey()).toThrow(/OPENAI_API_KEY não configurada/);
  });

  it("aceita uma chave válida e retorna o valor sem alterações", () => {
    process.env.OPENAI_API_KEY = "sk-test-1234567890";
    expect(openaiKey()).toBe("sk-test-1234567890");
  });

  it("não faz trim nem altera espaços acidentais (comportamento explícito)", () => {
    process.env.OPENAI_API_KEY = "  sk-test-espacos  ";
    expect(openaiKey()).toBe("  sk-test-espacos  ");
  });
});

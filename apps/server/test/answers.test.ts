import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let tmp = "";

vi.mock("../src/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/paths.js")>();
  return {
    ...actual,
    assist: (...p: string[]) => path.join(tmp, ...p),
    dataDir: () => tmp,
    inData: (...p: string[]) => path.join(tmp, ...p),
    raw: (...p: string[]) => path.join(tmp, "raw", ...p),
  };
});

const { saveAnswerVersion, getAnswerRecord, restoreAnswerVersion, clearAnswerHistory } = await import(
  "../src/config.js"
);

beforeAll(() => {
  tmp = path.join(tmpdir(), `pauta-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmp, { recursive: true });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("saveAnswerVersion / histórico", () => {
  it("cria o primeiro registro sem histórico", () => {
    const rec = saveAnswerVersion(1, "primeira resposta", "ai");
    expect(rec.answer).toBe("primeira resposta");
    expect(rec.source).toBe("ai");
    expect(rec.history).toEqual([]);
    expect(getAnswerRecord(1)?.answer).toBe("primeira resposta");
  });

  it("guarda a resposta anterior no histórico quando o conteúdo muda", () => {
    saveAnswerVersion(2, "v1", "manual");
    const rec = saveAnswerVersion(2, "v2", "ai");
    expect(rec.answer).toBe("v2");
    expect(rec.history).toHaveLength(1);
    expect(rec.history[0]).toMatchObject({ answer: "v1", source: "manual" });
  });

  it("não duplica histórico quando o conteúdo é igual (apenas atualiza timestamp)", () => {
    saveAnswerVersion(3, "mesma resposta", "ai");
    const before = getAnswerRecord(3);
    const rec = saveAnswerVersion(3, "mesma resposta", "ai");
    expect(rec.history).toHaveLength(before?.history.length ?? 0);
    expect(rec.history).toHaveLength(0);
  });

  it("diferencia por selections mesmo com texto igual (quiz)", () => {
    saveAnswerVersion(4, "Q1: A", "ai", undefined, []);
    const rec = saveAnswerVersion(4, "Q1: A", "ai", undefined, [
      { questionId: 1, optionIndex: 1, letter: "b", optionId: 102 },
    ]);
    expect(rec.history).toHaveLength(1);
  });

  it("limita o histórico a 20 versões", () => {
    saveAnswerVersion(5, "v0", "manual");
    for (let i = 1; i <= 25; i++) {
      saveAnswerVersion(5, `versão ${i}`, "ai");
    }
    const rec = getAnswerRecord(5);
    expect(rec?.history).toHaveLength(20);
    expect(rec?.answer).toBe("versão 25");
    expect(rec?.history[0].answer).toBe("versão 5");
    expect(rec?.history[19].answer).toBe("versão 24");
  });
});

describe("restoreAnswerVersion", () => {
  it("restaura uma versão do histórico e empurra a atual para o histórico", () => {
    saveAnswerVersion(6, "v1", "manual");
    saveAnswerVersion(6, "v2", "ai");
    const rec = restoreAnswerVersion(6, 0);
    expect(rec.answer).toBe("v1");
    expect(rec.history.map((h) => h.answer)).toEqual(["v2"]);
    expect(getAnswerRecord(6)?.answer).toBe("v1");
  });

  it("rejeita índice inexistente", async () => {
    saveAnswerVersion(7, "única", "ai");
    expect(() => restoreAnswerVersion(7, 0)).toThrow(/histórico indisponível/);
  });
});

describe("clearAnswerHistory", () => {
  it("limpa o histórico mantendo a resposta atual", () => {
    saveAnswerVersion(8, "v1", "manual");
    saveAnswerVersion(8, "v2", "ai");
    const rec = clearAnswerHistory(8);
    expect(rec.answer).toBe("v2");
    expect(rec.history).toEqual([]);
    expect(getAnswerRecord(8)?.history).toEqual([]);
  });
});

describe("getAnswerRecord", () => {
  it("retorna null para atividade sem resposta", () => {
    expect(getAnswerRecord(99999)).toBeNull();
  });
});

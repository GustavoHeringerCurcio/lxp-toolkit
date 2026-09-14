import { describe, expect, it } from "vitest";
import {
  applyGateRules,
  clampScore,
  draftHash,
  draftHashInput,
  gateChecks,
  parseGateResult,
  scoreFromParts,
  verdictFor,
} from "../src/gate.js";
import { stripHtml } from "../src/build.js";
import type { GateResult } from "../src/types.js";
import { makeExercise } from "./helpers.js";

describe("draftHash", () => {
  it("is stable and ignores surrounding whitespace", () => {
    expect(draftHash("  hello world  ")).toBe(draftHash("hello world"));
    expect(draftHash("hello world")).not.toBe(draftHash("hello worlds"));
    // Must match the web-side `hashDraft` (djb2 variant).
    expect(draftHash("UC-01")).toBe("5:237413931");
  });
});

describe("draftHashInput", () => {
  it("keeps the raw multi-line draft (newlines preserved)", () => {
    const draft = "UC-01 — Login\nFluxo Principal:\n1. Acessa";
    expect(draftHashInput(draft)).toBe(draft);
    expect(draftHashInput("  padded  ")).toBe("padded");
  });

  it("is NOT the whitespace-collapsed stripHtml text (the refresh bug)", () => {
    const draft = "UC-01 — Login\nFluxo Principal:\n1. Acessa";
    // The web panel hashes the raw draft; the server must hash the same text.
    expect(draftHash(draftHashInput(draft))).toBe(draftHash(draft));
    expect(draftHash(draftHashInput(draft))).not.toBe(draftHash(stripHtml(draft)));
    // Locks the djb2 variant shared with the web `hashDraft`.
    expect(draftHash("UC-01\nFluxo")).toBe("11:-526983549");
  });
});

describe("clampScore", () => {
  it("clamps and rounds into 0–100", () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(72.6)).toBe(73);
    expect(clampScore("80")).toBe(80);
  });

  it("falls back for missing/invalid values", () => {
    expect(clampScore(undefined, 42)).toBe(42);
    expect(clampScore("abc", 7)).toBe(7);
    expect(clampScore(null, 1)).toBe(1);
  });
});

describe("scoreFromParts", () => {
  it("weights relevance > completeness > human tone", () => {
    expect(scoreFromParts(100, 100, 100)).toBe(100);
    expect(scoreFromParts(0, 0, 0)).toBe(0);
    expect(scoreFromParts(100, 0, 0)).toBe(20);
    expect(scoreFromParts(0, 100, 0)).toBe(45);
    expect(scoreFromParts(0, 0, 100)).toBe(35);
  });
});

describe("verdictFor", () => {
  it("maps a score to a verdict", () => {
    expect(verdictFor(80)).toBe("ready");
    expect(verdictFor(79)).toBe("review");
    expect(verdictFor(50)).toBe("review");
    expect(verdictFor(49)).toBe("weak");
  });
});

describe("parseGateResult", () => {
  it("computes the weighted score from the sub-scores", () => {
    const r = parseGateResult(
      JSON.stringify({
        humanScore: 80,
        relevanceScore: 90,
        completenessScore: 70,
        summary: "ok",
        issues: ["falta um passo"],
        suggestions: ["detalhe o fluxo"],
      }),
      "gpt-5-nano",
    );
    expect(r).not.toBeNull();
    expect(r!.score).toBe(scoreFromParts(80, 90, 70));
    expect(r!.verdict).toBe(verdictFor(r!.score));
    expect(r!.issues).toEqual(["falta um passo"]);
    expect(r!.suggestions).toEqual(["detalhe o fluxo"]);
    expect(r!.model).toBe("gpt-5-nano");
  });

  it("returns null for invalid JSON or missing scores", () => {
    expect(parseGateResult("not json", "m")).toBeNull();
    expect(parseGateResult("[]", "m")).toBeNull();
    expect(parseGateResult("{}", "m")).toBeNull();
  });

  it("clamps out-of-range sub-scores", () => {
    const r = parseGateResult(
      JSON.stringify({ humanScore: 500, relevanceScore: -20, completenessScore: 50 }),
      "m",
    );
    expect(r!.humanScore).toBe(100);
    expect(r!.relevanceScore).toBe(0);
    expect(r!.completenessScore).toBe(50);
  });
});

const GOOD_UC = `UC-01 — Login de Usuário
Identificador: UC-01
Atores: Usuário
Descrição / Objetivo: Permitir login.
Pré-condições: cadastro prévio
Pós-condições: usuário autenticado
Fluxo Principal:
1. O usuário acessa a página de login.
2. O usuário insere e-mail e senha.
3. O sistema verifica as credenciais.
Fluxos Alternativos / Exceções:
3a. Credenciais incorretas: o sistema exibe erro e solicita nova tentativa.
Observações: acesso restrito.`;

const BAD_UC = `UC-01 — Login de Usuário
Atores: Usuário
Descrição / Objetivo: Permitir login.
Pós-condições: usuário registrado e autenticado.
Fluxo Principal:
1. O usuário acessa a página de login.
2. O usuário insere e-mail e senha.
3. O sistema verifica as credenciais.
Fluxos Alternativos / Exceções:
5a. O usuário insere credenciais incorretas: exibe erro.
Observações: não há integração com backend.

UC-02 — Cadastro
Atores:
Descrição / Objetivo:
Fluxo Principal:
1. Acessa a página.`;

describe("gateChecks", () => {
  it("passes a well-formed use-case draft", () => {
    const checks = gateChecks(makeExercise(), GOOD_UC);
    expect(checks.map((c) => c.code)).toEqual([
      "uc_estrutura",
      "fluxo_alternativo_ancorado",
      "coerencia_pos_observacoes",
    ]);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("catches a mis-anchored alternative flow and a contradicted post-condition", () => {
    const checks = gateChecks(makeExercise(), BAD_UC);
    const byCode = Object.fromEntries(checks.map((c) => [c.code, c]));
    expect(byCode.fluxo_alternativo_ancorado.ok).toBe(false);
    expect(byCode.fluxo_alternativo_ancorado.detail).toContain("passo 5");
    expect(byCode.coerencia_pos_observacoes.ok).toBe(false);
    expect(byCode.uc_estrutura.ok).toBe(false);
  });

  it("returns no checks for a non-template draft", () => {
    expect(gateChecks(makeExercise(), "Uma redação qualquer sobre ética.")).toEqual([]);
  });
});

describe("applyGateRules", () => {
  const base: GateResult = {
    score: 95,
    humanScore: 90,
    relevanceScore: 95,
    completenessScore: 95,
    verdict: "ready",
    summary: "",
    issues: [],
    suggestions: [],
    model: "m",
    checks: [],
  };

  it("keeps a ready draft with completeness > 90 and no failed checks", () => {
    expect(applyGateRules(base).verdict).toBe("ready");
  });

  it("downgrades when completeness is <= 90", () => {
    const r = applyGateRules({ ...base, completenessScore: 90 });
    expect(r.verdict).toBe("review");
    expect(r.score).toBe(79);
  });

  it("downgrades when a rubric check fails", () => {
    const r = applyGateRules({
      ...base,
      checks: [{ code: "x", label: "x", ok: false, detail: "falhou" }],
    });
    expect(r.verdict).toBe("review");
  });
});

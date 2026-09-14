import { describe, expect, it } from "vitest";
import { gateLogReason, renderDebugMarkdown, shouldLog, type DebugLogBundle } from "../src/debug-log.js";
import type { GateResult } from "../src/types.js";

function gate(patch: Partial<GateResult> = {}): GateResult {
  return {
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
    ...patch,
  };
}

describe("gateLogReason", () => {
  it("returns null for a ready, complete, check-clean draft", () => {
    expect(gateLogReason(gate())).toBeNull();
    expect(shouldLog(gate())).toBe(false);
  });

  it("logs when completeness is <= 90", () => {
    const reason = gateLogReason(gate({ completenessScore: 90 }));
    expect(reason).toContain("completude");
  });

  it("logs a weak verdict", () => {
    expect(gateLogReason(gate({ verdict: "weak" }))).toContain("weak");
  });

  it("logs a failed rubric check", () => {
    const reason = gateLogReason(
      gate({ checks: [{ code: "fluxo_alternativo_ancorado", label: "x", ok: false, detail: "y" }] }),
    );
    expect(reason).toContain("verificações falhas");
    expect(reason).toContain("fluxo_alternativo_ancorado");
  });

  it("does not log a plain review with no other problem", () => {
    expect(gateLogReason(gate({ verdict: "review" }))).toBeNull();
  });
});

describe("renderDebugMarkdown", () => {
  it("includes the reason, project, prompt and completion", () => {
    const bundle: DebugLogBundle = {
      contentItemId: 42,
      answerAttemptId: 7,
      reason: "completude 80% <= 90",
      activity: {
        title: "Caso de Uso",
        kind: "upload",
        courseName: "Arquitetura",
        moduleTitle: "Módulo 1",
        instructionsText: "Preencha a tabela",
        files: ["Modelo.docx"],
      },
      project: {
        theme: "Aplicativo de saúde",
        atores: ["Usuário"],
        requisitos: ["Login"],
        origin: "main",
        confidence: 0.4,
        source: "auto",
        model: "gpt-5-nano",
        intent: "preencher tabela",
        reason: "sinal forte",
        needsProject: true,
      },
      templateFields: ["Atores", "Fluxo Principal"],
      abilities: { uml_diagram: true },
      generation: {
        model: "gpt-4o",
        temperature: 0.2,
        prompt: "[system]\nregras",
        completion: "UC-01 — Login",
        promptHash: "abc",
        tokensIn: 10,
        tokensOut: 20,
      },
      gate: gate({ completenessScore: 80, verdict: "review" }),
      createdAt: "2026-09-13T00:00:00.000Z",
    };

    const md = renderDebugMarkdown(bundle);
    expect(md).toContain("Diagnóstico — Caso de Uso");
    expect(md).toContain("completude 80% <= 90");
    expect(md).toContain("Aplicativo de saúde");
    expect(md).toContain("confiança: 0.4");
    expect(md).toContain("Fluxo Principal");
    expect(md).toContain("[system]");
    expect(md).toContain("UC-01 — Login");
  });
});

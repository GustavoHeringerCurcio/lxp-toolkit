import { describe, expect, it } from "vitest";
import { gateLogReason, renderDebugMarkdown, shouldLog, type DebugLogBundle } from "../src/debug-log.js";
import type { GateResult } from "../src/types.js";

function gate(patch: Partial<GateResult> = {}): GateResult {
  return {
    verdict: "good",
    reason: "",
    model: "m",
    ...patch,
  };
}

describe("gateLogReason", () => {
  it("does not log good or ok drafts", () => {
    expect(gateLogReason(gate({ verdict: "good" }))).toBeNull();
    expect(gateLogReason(gate({ verdict: "ok" }))).toBeNull();
    expect(shouldLog(gate({ verdict: "good" }))).toBe(false);
  });

  it("logs bad and terrible with the reason", () => {
    expect(gateLogReason(gate({ verdict: "bad", reason: "falta o fluxo" }))).toBe(
      "julgamento bad: falta o fluxo",
    );
    expect(shouldLog(gate({ verdict: "terrible" }))).toBe(true);
  });
});

describe("renderDebugMarkdown", () => {
  it("includes the reason, project, prompt and completion", () => {
    const bundle: DebugLogBundle = {
      contentItemId: 42,
      answerAttemptId: 7,
      reason: "julgamento bad: falta o fluxo",
      activity: {
        title: "Caso de Uso",
        kind: "upload",
        courseName: "Arquitetura",
        moduleTitle: "Módulo 1",
        instructionsText: "Preencha a tabela",
        files: ["Modelo.docx"],
      },
      project: {
        title: "FastAid",
        enabled: true,
        origin: "module",
        configured: true,
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
      gate: gate({ verdict: "bad", reason: "falta o fluxo principal" }),
      createdAt: "2026-09-13T00:00:00.000Z",
    };

    const md = renderDebugMarkdown(bundle);
    expect(md).toContain("Diagnóstico — Caso de Uso");
    expect(md).toContain("**Julgamento:** bad");
    expect(md).toContain("falta o fluxo principal");
    expect(md).toContain("FastAid");
    expect(md).toContain("Origem: module");
    expect(md).toContain("Fluxo Principal");
    expect(md).toContain("[system]");
    expect(md).toContain("UC-01 — Login");
  });
});

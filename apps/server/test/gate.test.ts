import { describe, expect, it } from "vitest";
import { clampScore, parseGateResult, scoreFromParts, verdictFor } from "../src/gate.js";

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

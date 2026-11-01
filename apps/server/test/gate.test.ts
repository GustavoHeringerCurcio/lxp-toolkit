import { describe, expect, it } from "vitest";
import { draftHash, draftHashInput, isGateVerdict, parseGateResult } from "../src/gate.js";
import { stripHtml } from "../src/build.js";

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

describe("isGateVerdict", () => {
  it("accepts only the four levels", () => {
    for (const v of ["terrible", "bad", "ok", "good"]) expect(isGateVerdict(v)).toBe(true);
    for (const v of ["ready", "review", "weak", "", "GOOD", null, 1]) {
      expect(isGateVerdict(v)).toBe(false);
    }
  });
});

describe("parseGateResult", () => {
  it("parses each verdict with a reason", () => {
    for (const verdict of ["terrible", "bad", "ok", "good"]) {
      const r = parseGateResult(JSON.stringify({ verdict, reason: "motivo" }), "gpt-5-nano");
      expect(r).toEqual({ verdict, reason: "motivo", model: "gpt-5-nano" });
    }
  });

  it("trims the reason", () => {
    const r = parseGateResult(JSON.stringify({ verdict: "ok", reason: "  no ponto.  " }), "m");
    expect(r?.reason).toBe("no ponto.");
  });

  it("returns null for invalid JSON or verdicts", () => {
    expect(parseGateResult("not json", "m")).toBeNull();
    expect(parseGateResult("[]", "m")).toBeNull();
    expect(parseGateResult("{}", "m")).toBeNull();
    expect(parseGateResult(JSON.stringify({ verdict: "ready", reason: "x" }), "m")).toBeNull();
    expect(parseGateResult(JSON.stringify({ verdict: "review" }), "m")).toBeNull();
    expect(parseGateResult(JSON.stringify({ verdict: "weak" }), "m")).toBeNull();
  });

  it("ignores legacy score fields", () => {
    const legacy = JSON.stringify({
      humanScore: 90,
      relevanceScore: 80,
      completenessScore: 70,
      verdict: "review",
    });
    expect(parseGateResult(legacy, "m")).toBeNull();
  });
});

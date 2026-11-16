import { describe, expect, it } from "vitest";
import {
  buildGateUserPrompt,
  draftHash,
  draftHashInput,
  GATE_SYSTEM_PROMPT,
  isGateVerdict,
  parseGateResult,
} from "../src/gate.js";
import { htmlToText, stripHtml } from "../src/build.js";
import type { Exercise } from "../src/types.js";

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

describe("buildGateUserPrompt", () => {
  const exercise = {
    title: "BDI - Atividade 08 - AVD2",
    kind: "upload",
    instructionsText: "<p>Monte a tabela do MER.</p><p>Envie o arquivo em PDF.</p>",
  } as unknown as Exercise;

  it("preserves the draft line structure (no whitespace flattening)", () => {
    const draft = "| Entidade | Atributos |\n|---|---|\n| Alunos | Nome |";
    const prompt = buildGateUserPrompt(exercise, draft);
    expect(prompt).toContain(draft);
    expect(prompt).not.toContain("| Entidade | Atributos | |---|---|");
  });

  it("includes the final submission format and the activity contract", () => {
    const prompt = buildGateUserPrompt(exercise, "resposta", {
      submission: "PDF: o rascunho será renderizado e uma página de diagrama será anexada.",
      contract: "Preencha os campos/colunas: Entidade, Atributos.",
    });
    expect(prompt).toContain("Formato de envio ao portal");
    expect(prompt).toContain("PDF: o rascunho será renderizado");
    expect(prompt).toContain("Contrato da atividade");
    expect(prompt).toContain("Entidade, Atributos");
  });

  it("converts instruction HTML to text but keeps paragraph breaks", () => {
    const prompt = buildGateUserPrompt(exercise, "x");
    expect(prompt).toContain("Monte a tabela do MER.\nEnvie o arquivo em PDF.");
  });

  it("never says the statement is empty and feeds the quiz questions", () => {
    const quiz = {
      title: "Questionário 1",
      kind: "quiz",
      instructionsText: "",
      questions: [
        {
          id: 1,
          text: "O que é TCP?",
          options: [
            { id: 11, text: "Um protocolo de transporte" },
            { id: 12, text: "Uma linguagem" },
          ],
        },
      ],
      files: [],
      remoteFiles: [],
    } as unknown as Exercise;
    const prompt = buildGateUserPrompt(quiz, "É um protocolo de transporte confiável.");
    expect(prompt).not.toContain("(vazio)");
    expect(prompt).toContain("O que a atividade pede");
    expect(prompt).toContain("O que é TCP?");
    expect(prompt).toContain("Um protocolo de transporte");
    expect(prompt).toContain("não informado");
  });

  it("includes attachment names without requiring the statement", () => {
    const upload = {
      title: "Atividade com modelo",
      kind: "upload",
      instructionsText: "",
      questions: [],
      files: [{ name: "modelo.docx" }],
      remoteFiles: [{ filename: "brief.pdf", url: "https://example.test/brief.pdf" }],
    } as unknown as Exercise;
    const prompt = buildGateUserPrompt(upload, "resposta");
    expect(prompt).toContain("modelo.docx");
    expect(prompt).toContain("brief.pdf");
    expect(prompt).toContain("não informado");
  });

  it("system prompt forbids refusing to evaluate for a missing statement", () => {
    expect(GATE_SYSTEM_PROMPT).toContain("NUNCA impede a avaliação");
    expect(GATE_SYSTEM_PROMPT).toContain("nunca diga que não é possível avaliar");
    expect(GATE_SYSTEM_PROMPT).toContain("Sempre devolva um dos quatro veredictos");
  });
});

describe("htmlToText", () => {
  it("keeps newlines and table cells readable", () => {
    const html = "<p>Linha 1</p><p>Linha 2</p><table><tr><td>A</td><td>B</td></tr></table>";
    expect(htmlToText(html)).toBe("Linha 1\nLinha 2\nA | B");
    expect(stripHtml(html)).toBe("Linha 1 Linha 2 A B");
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

import type { AiConfig, Exercise } from "./types.js";
import { cheapJsonCompletion } from "./ai.js";
import { stripHtml } from "./build.js";

/**
 * Quality gate for a generated draft. One cheap-model JSON call that judges how
 * human the writing sounds, how well it answers the professor's question, and
 * how complete it is. The overall `score` is computed here (not by the model) so
 * a single number can never be inflated.
 */
export interface GateResult {
  /** Weighted 0–100 confidence that the answer is ready to send. */
  score: number;
  /** 0–100: does the writing sound natural (not robotic/generic)? */
  humanScore: number;
  /** 0–100: does it answer exactly what was asked? */
  relevanceScore: number;
  /** 0–100: does it cover everything the task requests? */
  completenessScore: number;
  verdict: "ready" | "review" | "weak";
  /** One-line assessment. */
  summary: string;
  issues: string[];
  suggestions: string[];
  model: string;
}

/** Clamp a model-provided number into an integer 0–100. */
export function clampScore(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Overall confidence: relevance matters most, then completeness, then tone. */
export function scoreFromParts(human: number, relevance: number, completeness: number): number {
  return clampScore(0.2 * clampScore(human) + 0.45 * clampScore(relevance) + 0.35 * clampScore(completeness));
}

export function verdictFor(score: number): GateResult["verdict"] {
  if (score >= 80) return "ready";
  if (score >= 50) return "review";
  return "weak";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown, max = 6): string[] {
  return Array.isArray(v)
    ? v
        .map((i) => str(i).trim())
        .filter(Boolean)
        .slice(0, max)
    : [];
}

/**
 * Parse the model's JSON reply into a `GateResult`. Returns null when the reply
 * is not a usable object, so the caller can show "analysis unavailable".
 */
export function parseGateResult(text: string, model: string): GateResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const humanScore = clampScore(o.humanScore, -1);
  const relevanceScore = clampScore(o.relevanceScore, -1);
  const completenessScore = clampScore(o.completenessScore, -1);
  if (humanScore < 0 && relevanceScore < 0 && completenessScore < 0) return null;
  const h = Math.max(0, humanScore);
  const r = Math.max(0, relevanceScore);
  const c = Math.max(0, completenessScore);
  const score = scoreFromParts(h, r, c);
  return {
    score,
    humanScore: h,
    relevanceScore: r,
    completenessScore: c,
    verdict: verdictFor(score),
    summary: str(o.summary).trim().slice(0, 300),
    issues: strArr(o.issues),
    suggestions: strArr(o.suggestions),
    model,
  };
}

const SYSTEM =
  "Você é um avaliador rigoroso de respostas de alunos. Avalie a RESPOSTA do aluno em relação ao ENUNCIADO do professor " +
  "em três critérios, cada um de 0 a 100:\n" +
  '- "humanScore": a escrita parece natural e humana, sem tom robótico, genérico ou de assistente?\n' +
  '- "relevanceScore": a resposta responde exatamente ao que o enunciado pede (e não a outro assunto)?\n' +
  '- "completenessScore": a resposta cobre todos os itens/passos/campos solicitados, sem lacunas?\n' +
  'Responda SOMENTE com JSON no formato {"humanScore":number,"relevanceScore":number,"completenessScore":number,' +
  '"summary":"<avaliação em uma frase>","issues":["<problema>"],"suggestions":["<sugestão de melhoria>"]}. ' +
  "Seja honesto e exigente: notas altas só quando a resposta realmente merecer. Escreva em português.";

/**
 * Analyze a draft against the activity's question with the cheapest model.
 * Best-effort: returns null on any failure or empty input.
 */
export async function analyzeDraftQuality(
  cfg: AiConfig,
  e: Exercise,
  draft: string,
): Promise<GateResult | null> {
  const draftText = stripHtml(draft ?? "").trim();
  if (!draftText) return null;
  const instructions = stripHtml(e.instructionsText ?? "").slice(0, 6000);
  const user = [
    `Atividade: ${e.title}`,
    `Tipo: ${e.kind}`,
    `Enunciado do professor:\n${instructions || "(vazio)"}`,
    `Resposta do aluno:\n${draftText.slice(0, 12000)}`,
  ].join("\n\n");

  try {
    const { text, model } = await cheapJsonCompletion(cfg, SYSTEM, user, 700);
    return parseGateResult(text, model);
  } catch {
    return null;
  }
}

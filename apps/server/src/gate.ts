import type { AiConfig, Exercise, GateCheck, GateResult } from "./types.js";
import { cheapJsonCompletion } from "./ai.js";
import { stripHtml } from "./build.js";
import { parseUseCases } from "./usecase.js";

/**
 * Stable hash of the analyzed draft, used to detect a stale saved analysis.
 * Must match the web-side `hashDraft` in `gate-panel.tsx` (same djb2 variant).
 */
export function draftHash(text: string): string {
  const s = text.trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
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
    checks: [],
  };
}

// ── Deterministic rubric checks (template / use-case aware) ─────────────────

/** Look up a field by normalized label, tolerating longer variants. */
function fieldByPrefix(fields: Record<string, string>, prefix: string): string {
  const exact = fields[prefix];
  if (exact != null) return exact;
  const key = Object.keys(fields).find((k) => k.startsWith(prefix));
  return key ? fields[key] : "";
}

/** Numbers of the numbered steps in a main flow ("1. ...", "2) ..."). */
function stepNumbers(flow: string): number[] {
  const nums: number[] = [];
  for (const line of flow.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*[.)]/);
    if (m) nums.push(Number(m[1]));
  }
  return nums;
}

/**
 * Deterministic checks for a "fill the professor's template" draft. Returns an
 * empty list when the draft is not a use-case template, so non-template drafts
 * are unaffected. These catch the exact failure modes an LLM tends to make:
 * missing actors/goals, alternative flows that point at a non-existent step,
 * and post-conditions contradicted by the student's own observations.
 */
export function gateChecks(_e: Exercise, draft: string): GateCheck[] {
  const cases = parseUseCases(draft);
  if (!cases.length) return [];
  const checks: GateCheck[] = [];

  const structural: string[] = [];
  for (const c of cases) {
    const name = c.name || c.id;
    const missing: string[] = [];
    if (!fieldByPrefix(c.fields, "atores").trim()) missing.push("atores");
    if (!fieldByPrefix(c.fields, "descricao objetivo").trim()) missing.push("objetivo");
    const steps = fieldByPrefix(c.fields, "fluxo principal")
      .split("\n")
      .filter((l) => l.trim()).length;
    if (steps < 2) missing.push("fluxo principal (>= 2 passos)");
    if (missing.length) structural.push(`${name}: falta ${missing.join(", ")}`);
  }
  checks.push({
    code: "uc_estrutura",
    label: "Estrutura de cada caso de uso (atores, objetivo, fluxo)",
    ok: structural.length === 0,
    detail: structural.join("; "),
  });

  const anchors: string[] = [];
  for (const c of cases) {
    const main = new Set(stepNumbers(fieldByPrefix(c.fields, "fluxo principal")));
    for (const line of fieldByPrefix(c.fields, "fluxos alternativos").split("\n")) {
      const m = line.match(/^\s*(\d+)\s*[a-z]/i);
      if (m && !main.has(Number(m[1]))) {
        anchors.push(`${c.name || c.id}: "${line.trim().slice(0, 60)}" aponta para o passo ${m[1]} inexistente`);
      }
    }
  }
  checks.push({
    code: "fluxo_alternativo_ancorado",
    label: "Fluxos alternativos ancorados no fluxo principal",
    ok: anchors.length === 0,
    detail: anchors.join("; "),
  });

  const contradictions: string[] = [];
  for (const c of cases) {
    const post = fieldByPrefix(c.fields, "pos condicoes");
    const obs = fieldByPrefix(c.fields, "observacoes");
    if (post.trim() && obs.trim() && /\bn[aã]o\b|\bsem\b|\bnunca\b|\bn[aã]o h[aá]\b/i.test(obs)) {
      contradictions.push(`${c.name || c.id}: observação contradiz a pós-condição ("${obs.trim().slice(0, 80)}")`);
    }
  }
  checks.push({
    code: "coerencia_pos_observacoes",
    label: "Pós-condição coerente com as observações",
    ok: contradictions.length === 0,
    detail: contradictions.join("; "),
  });

  return checks;
}

/**
 * Apply the hard rubric rules on top of the model's scores. Completeness must
 * be strictly above 90 to be considered ready, and any failed check downgrades
 * "ready" to "review" (the draft is never auto-approved with known issues).
 */
export function applyGateRules(result: GateResult): GateResult {
  const checks = result.checks ?? [];
  const failed = checks.filter((c) => !c.ok);
  let verdict = result.verdict;
  if (result.completenessScore <= 90 && verdict === "ready") verdict = "review";
  if (failed.length && verdict === "ready") verdict = "review";
  let score = result.score;
  if (verdict === "review") score = Math.min(score, 79);
  if (verdict === "weak") score = Math.min(score, 49);
  return { ...result, score, verdict, checks };
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
 * Analyze a draft against the activity's question with the configured gate
 * model, then apply the deterministic rubric checks and hard rules. Best-effort:
 * returns null on any failure or empty input.
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
    const { text, model } = await cheapJsonCompletion(cfg, SYSTEM, user, 700, cfg.models.gate);
    const result = parseGateResult(text, model);
    if (!result) return null;
    return applyGateRules({
      ...result,
      checks: gateChecks(e, draftText),
      draftHash: draftHash(draftText),
    });
  } catch {
    return null;
  }
}

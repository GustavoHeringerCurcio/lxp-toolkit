import type { AiConfig, Exercise, GateResult, GateVerdict } from "./types.js";
import { cheapJsonCompletion } from "./ai.js";
import { stripHtml } from "./build.js";

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

/**
 * The exact text a saved analysis is hashed from: the RAW draft, only trimmed.
 * Must never be the HTML-stripped/whitespace-collapsed text, otherwise the web
 * panel (which hashes the raw draft) can never match it after a refresh.
 */
export function draftHashInput(draft: string): string {
  return (draft ?? "").trim();
}

const VERDICTS: readonly GateVerdict[] = ["terrible", "bad", "ok", "good"];

export function isGateVerdict(value: unknown): value is GateVerdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
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
  if (!isGateVerdict(o.verdict)) return null;
  return {
    verdict: o.verdict,
    reason: str(o.reason).trim().slice(0, 160),
    model,
  };
}

const SYSTEM =
  "Você avalia a RESPOSTA de um aluno em relação ao ENUNCIADO do professor e devolve UM julgamento. " +
  "Use exatamente um destes quatro níveis:\n" +
  '- "good": responde tudo o que foi pedido, está correto/coerente e soa natural como um aluno. Nada importante falta.\n' +
  '- "ok": responde à tarefa; pode ter pequenas falhas de estilo ou detalhes, mas não impede enviar.\n' +
  '- "bad": falta uma parte importante, há erro relevante ou o texto parece claramente de IA/robótico. Corrija antes de enviar.\n' +
  '- "terrible": falta o conteúdo essencial, a resposta está vazia/genérica demais ou responde a outra tarefa. Não dá para enviar.\n' +
  "Na dúvida entre ok e bad, escolha bad. Seja específico e breve.\n" +
  'Responda SOMENTE com JSON no formato {"verdict":"terrible|bad|ok|good","reason":"<uma frase curta em português>"}.';

/**
 * Analyze a draft against the activity's question with the configured gate
 * model. Best-effort: returns null on any failure or empty input.
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
    const { text, model } = await cheapJsonCompletion(cfg, SYSTEM, user, 250, cfg.models.gate);
    const result = parseGateResult(text, model);
    if (!result) return null;
    return {
      ...result,
      // Hash the RAW draft (only trimmed), never the HTML-stripped/whitespace-
      // collapsed text: the web panel hashes the raw draft, and the two must
      // match for a saved analysis to be recognized after a refresh.
      draftHash: draftHash(draftHashInput(draft)),
    };
  } catch {
    return null;
  }
}

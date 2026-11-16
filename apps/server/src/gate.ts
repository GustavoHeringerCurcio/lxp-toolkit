import type { AiConfig, Exercise, GateResult, GateVerdict } from "./types.js";
import { cheapJsonCompletion } from "./ai.js";
import { htmlToText } from "./build.js";

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
  "O texto do aluno é o RASCUNHO: o sistema gera o arquivo final (texto, TXT, PDF ou DOCX) e pode anexar " +
  "automaticamente uma página de diagrama. Portanto: NUNCA exija que o rascunho já seja um PDF/DOCX nem " +
  "que contenha o arquivo final; NUNCA penalize Markdown, títulos, listas, tabelas ou lacunas preenchidas, " +
  "pois eles são renderizados no arquivo. Pedidos como \"enviar em PDF/DOCX\" são instruções de ENTREGA, " +
  "não requisitos de conteúdo. Avalie conteúdo, completude e aderência ao que o professor pediu. " +
  "Na dúvida entre ok e bad, só escolha bad quando houver uma falha objetiva; seja específico e breve.\n" +
  'Responda SOMENTE com JSON no formato {"verdict":"terrible|bad|ok|good","reason":"<uma frase curta em português>"}.';

export interface GateDebug {
  system: string;
  user: string;
  raw: string;
  model: string;
  error?: string;
}

/** Extra per-activity context: how the draft will be delivered + its contract. */
export interface GatePromptContext {
  /** Human-readable final format (PDF/DOCX/TXT + artifacts), when known. */
  submission?: string;
  /** Template fields, project in use, structural hints, etc. */
  contract?: string;
}

export interface GateAnalysis {
  result: GateResult | null;
  debug: GateDebug;
}

/**
 * The exact user message sent to the gate. Kept pure/exported so tests can lock
 * the format contract: the draft is the RAW text (newlines preserved) and the
 * final submission format is described explicitly.
 */
export function buildGateUserPrompt(
  e: Exercise,
  draft: string,
  ctx: GatePromptContext = {},
): string {
  const scope = 6000;
  const instructions = htmlToText(e.instructionsText ?? "").slice(0, scope);
  // Never flatten the draft: tables, use-case blocks and lists must stay
  // readable. The web panel hashes this same raw text.
  const draftText = (draft ?? "").trim().slice(0, 12000);
  return [
    `Atividade: ${e.title}`,
    `Tipo: ${e.kind}`,
    `Enunciado do professor:\n${instructions || "(vazio)"}`,
    ctx.submission?.trim() ? `Formato de envio ao portal:\n${ctx.submission.trim()}` : "",
    ctx.contract?.trim() ? `Contrato da atividade:\n${ctx.contract.trim()}` : "",
    `Resposta do aluno:\n${draftText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Analyze a draft and keep the exact gate prompt/response for the JSON log.
 * Best-effort: returns a null result on any failure or empty input.
 */
export async function analyzeDraftQualityDetailed(
  cfg: AiConfig,
  e: Exercise,
  draft: string,
  ctx: GatePromptContext = {},
): Promise<GateAnalysis> {
  const draftText = (draft ?? "").trim();
  const user = buildGateUserPrompt(e, draft, ctx);
  const baseDebug = { system: SYSTEM, user, raw: "", model: cfg.models.gate };

  if (!draftText) return { result: null, debug: baseDebug };

  try {
    const { text, model } = await cheapJsonCompletion(cfg, SYSTEM, user, 250, cfg.models.gate);
    const result = parseGateResult(text, model);
    return {
      result: result
        ? {
            ...result,
            // Hash the RAW draft (only trimmed), never the HTML-stripped/whitespace-
            // collapsed text: the web panel hashes the raw draft, and the two must
            // match for a saved analysis to be recognized after a refresh.
            draftHash: draftHash(draftHashInput(draft)),
          }
        : null,
      debug: { ...baseDebug, raw: text, model },
    };
  } catch (err) {
    return {
      result: null,
      debug: { ...baseDebug, error: err instanceof Error ? err.message : String(err) },
    };
  }
}

/** Analyze a draft against the activity's question (result only). */
export async function analyzeDraftQuality(
  cfg: AiConfig,
  e: Exercise,
  draft: string,
  ctx: GatePromptContext = {},
): Promise<GateResult | null> {
  return (await analyzeDraftQualityDetailed(cfg, e, draft, ctx)).result;
}

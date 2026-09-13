import { createHash } from "node:crypto";
import OpenAI from "openai";
import type { AiConfig, AiProfile, Exercise } from "./types.js";
import { openaiKey } from "./config.js";
import { buildMessages, resolveExtraInstructions } from "./prompt.js";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: openaiKey() });
  return _client;
}

export interface GenerateOpts {
  onDelta?: (text: string) => void;
}

export interface GeneratedAnswer {
  text: string;
  model: string;
  /** Readable prompt (system + user), for `ai_run` provenance. */
  prompt: string;
  /** sha256 of the serialized messages — stable id for dedupe/analysis. */
  promptHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

/**
 * Generate an answer for an exercise. The model receives a `system` message with
 * the structured style rules (plus the per-exercise extra instructions) and a
 * `user` message with the activity content — never the prompt scaffolding.
 *
 * Returns the text plus provenance (model, token usage, prompt) so the caller
 * can persist an `ai_run`.
 */
export async function generateAnswer(
  cfg: AiConfig,
  e: Exercise,
  extraInstructions: string,
  profile: AiProfile,
  opts: GenerateOpts = {},
  notes = "",
): Promise<GeneratedAnswer> {
  const messages = await buildMessages(
    e,
    profile,
    cfg.style,
    cfg.activitySections,
    resolveExtraInstructions(extraInstructions),
    notes,
  );

  const stream = await client().chat.completions.create({
    model: cfg.model,
    temperature: cfg.temperature,
    max_tokens: cfg.max_output_tokens ?? 2200,
    stream: true,
    stream_options: { include_usage: true },
    messages,
  });

  let full = "";
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      opts.onDelta?.(delta);
    }
    if (chunk.usage) {
      tokensIn = chunk.usage.prompt_tokens ?? tokensIn;
      tokensOut = chunk.usage.completion_tokens ?? tokensOut;
    }
  }

  const prompt = messages
    .map((m) => `[${m.role}]\n${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n\n");

  return {
    text: full,
    model: cfg.model,
    prompt,
    promptHash: createHash("sha256").update(JSON.stringify(messages)).digest("hex"),
    tokensIn,
    tokensOut,
  };
}

/**
 * Cheapest catalog model, used for the lightweight project-context detection.
 * Falls back to the configured model when unavailable.
 */
export const DETECT_MODEL = "gpt-5-nano";

type JsonRecord = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((i) => str(i)).filter(Boolean) : [];
}

function safeParse(text: string): JsonRecord {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

/**
 * One small JSON completion on the cheapest model (`gpt-5-nano`), falling back
 * to the configured model. Shared by all project-context detection calls.
 */
export async function cheapJsonCompletion(
  cfg: AiConfig,
  system: string,
  user: string,
  maxTokens = 700,
  /** When false, use the configured model first (better for structured inference). */
  preferCheap = true,
): Promise<{ text: string; model: string }> {
  const attempt = async (model: string): Promise<string> => {
    const resp = await client().chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  };
  const first = preferCheap ? DETECT_MODEL : cfg.model;
  const second = preferCheap ? cfg.model : DETECT_MODEL;
  try {
    return { text: await attempt(first), model: first };
  } catch {
    return { text: await attempt(second), model: second };
  }
}

export interface ProposedProject {
  theme: string;
  atores: string[];
  requisitos: string[];
}

export interface ActivityRelevance {
  needsProject: boolean;
  confidence: number;
  /** One-line summary of what the activity asks for. */
  intent: string;
  reason: string;
  /** A quick project proposed by the activity itself, when it hints at one. */
  proposed: ProposedProject | null;
  model: string;
}

/**
 * Decide whether an activity requires a project (theme/actors/requirements)
 * and, if so, propose a quick project from the activity text alone. Cheap and
 * conservative: one short JSON completion.
 */
export async function detectActivityRelevance(
  cfg: AiConfig,
  e: Exercise,
  notes = "",
): Promise<ActivityRelevance> {
  const system =
    "Você decide se uma atividade acadêmica exige que o aluno escolha ou use um PROJETO " +
    "(tema + atores + requisitos), por exemplo \"preencha a tabela do seu projeto\", " +
    "\"caso de uso do seu sistema\", \"escolha um tema\", \"com base no projeto do seu grupo\". " +
    "Responda SOMENTE com um objeto JSON, sem texto ao redor, no formato " +
    '{"needsProject": boolean, "confidence": number, "intent": string, "reason": string, ' +
    '"proposedTheme": string, "proposedAtores": string[], "proposedRequisitos": string[]}. ' +
    "`intent` resume em uma frase o que a atividade pede. `proposedTheme`/`proposedAtores`/`proposedRequisitos` " +
    "são um projeto RÁPIDO sugerido pela própria atividade (podem ficar vazios). " +
    "Nunca invente dados e seja conservador: só marque needsProject=true quando a atividade realmente pedir um projeto.";
  const user = [
    `Atividade: ${e.title}`,
    `Tipo: ${e.kind}`,
    `Módulo: ${e.moduleTitle}`,
    e.instructionsText ? `Enunciado:\n${e.instructionsText}` : "",
    notes ? `Observações do aluno:\n${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { text, model } = await cheapJsonCompletion(cfg, system, user, 500);
  const parsed = safeParse(text);
  const proposedTheme = str(parsed.proposedTheme);
  const proposedAtores = strArr(parsed.proposedAtores);
  const proposedRequisitos = strArr(parsed.proposedRequisitos);
  return {
    needsProject: parsed.needsProject === true,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    intent: str(parsed.intent),
    reason: str(parsed.reason),
    proposed:
      proposedTheme || proposedAtores.length || proposedRequisitos.length
        ? { theme: proposedTheme, atores: proposedAtores, requisitos: proposedRequisitos }
        : null,
    model,
  };
}

export interface CourseProjectDetection {
  theme: string;
  atores: string[];
  requisitos: string[];
  suggestedThemes: string[];
  confidence: number;
  model: string;
}

/**
 * Identify the course's MAIN project (theme, actors, requirements) plus any
 * alternative themes suggested by the material (dropdown options).
 */
export async function detectCourseProject(
  cfg: AiConfig,
  courseName: string,
  courseContext: string,
  activityIntents: string[],
): Promise<CourseProjectDetection> {
  const system =
    "Você identifica o PROJETO principal de um curso a partir do material fornecido. " +
    "Responda SOMENTE com um objeto JSON, sem texto ao redor, no formato " +
    '{"theme": string, "atores": string[], "requisitos": string[], "suggestedThemes": string[], "confidence": number}. ' +
    "`theme` é o tema/projeto do curso; `atores` são os usuários/sistemas externos; " +
    "`requisitos` são os requisitos funcionais; `suggestedThemes` são temas alternativos citados no material " +
    "(para um dropdown de escolha). Se não houver informação suficiente, devolva strings/arrays vazios — nunca invente.";
  const user = [
    `Curso: ${courseName}`,
    activityIntents.length
      ? `Atividades que pedem um projeto:\n${activityIntents.map((i) => `- ${i}`).join("\n")}`
      : "",
    courseContext ? `Material do curso:\n${courseContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { text, model } = await cheapJsonCompletion(cfg, system, user, 700);
  const parsed = safeParse(text);
  return {
    theme: str(parsed.theme),
    atores: strArr(parsed.atores),
    requisitos: strArr(parsed.requisitos),
    suggestedThemes: strArr(parsed.suggestedThemes),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    model,
  };
}

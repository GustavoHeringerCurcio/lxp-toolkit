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
 * Cheapest catalog model, used for the lightweight "where does this activity
 * belong?" detection. Falls back to the configured model when unavailable.
 */
export const DETECT_MODEL = "gpt-5-nano";

export interface DetectedContext {
  /** Project/theme the activity belongs to (empty when undetectable). */
  theme: string;
  atores: string[];
  requisitos: string[];
  /** Ready-to-inject instruction block (Portuguese) grounding the generation. */
  instructions: string;
  /** Model that actually answered. */
  model: string;
}

/**
 * Infer the project context an activity belongs to (theme, actors, functional
 * requirements) from the activity itself plus the surrounding course material.
 * Deliberately small and cheap: one short JSON completion on `gpt-5-nano`.
 */
export async function detectActivityContext(
  cfg: AiConfig,
  e: Exercise,
  courseContext: string,
  notes = "",
): Promise<DetectedContext> {
  const system =
    "Você ajuda um estudante a situar uma atividade no projeto dele. " +
    "Responda SOMENTE com um objeto JSON, sem texto ao redor, no formato " +
    '{"theme": string, "atores": string[], "requisitos": string[], "instructions": string}. ' +
    "`theme` é o tema do projeto (ex.: \"Loja Virtual\"); `atores` são os usuários/sistemas externos; " +
    "`requisitos` são os requisitos funcionais relevantes; `instructions` é um bloco curto em português, " +
    "pronto para anexar a um prompt, descrevendo tema, atores e requisitos para preencher a atividade. " +
    "Se não houver informação suficiente, devolva strings/arrays vazios — nunca invente.";
  const user = [
    `Atividade: ${e.title}`,
    `Módulo: ${e.moduleTitle}`,
    e.instructionsText ? `Enunciado:\n${e.instructionsText}` : "",
    notes ? `Observações do aluno:\n${notes}` : "",
    courseContext ? `Material do curso (pode conter o tema/projeto e os requisitos):\n${courseContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const attempt = async (model: string): Promise<string> => {
    const resp = await client().chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  };

  let raw = "";
  let model = DETECT_MODEL;
  try {
    raw = await attempt(DETECT_MODEL);
  } catch {
    model = cfg.model;
    raw = await attempt(cfg.model);
  }

  let parsed: Partial<DetectedContext> = {};
  try {
    parsed = JSON.parse(raw) as Partial<DetectedContext>;
  } catch {
    parsed = {};
  }
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((i) => String(i)).filter(Boolean) : []);
  return {
    theme: typeof parsed.theme === "string" ? parsed.theme : "",
    atores: strArr(parsed.atores),
    requisitos: strArr(parsed.requisitos),
    instructions: typeof parsed.instructions === "string" ? parsed.instructions : "",
    model,
  };
}

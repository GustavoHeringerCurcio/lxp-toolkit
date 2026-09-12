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

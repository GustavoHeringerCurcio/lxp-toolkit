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

/**
 * Generate an answer for an exercise. The model receives a `system` message with
 * the structured style rules (plus the per-exercise extra instructions) and a
 * `user` message with the activity content — never the prompt scaffolding.
 */
export async function generateAnswer(
  cfg: AiConfig,
  e: Exercise,
  extraInstructions: string,
  profile: AiProfile,
  opts: GenerateOpts = {},
  notes = "",
): Promise<string> {
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
    messages,
  });

  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      opts.onDelta?.(delta);
    }
  }
  return full;
}

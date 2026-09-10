import OpenAI from "openai";
import type { AiConfig, AiProfile, Exercise } from "./types.js";
import { openaiKey } from "./config.js";
import { buildMessages } from "./prompt.js";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: openaiKey() });
  return _client;
}

export interface GenerateOpts {
  onDelta?: (text: string) => void;
}

/**
 * Generate an answer for an exercise. The entire model input is the stored
 * message template rendered with the activity's placeholders — a single `user`
 * message, with no hidden system prompt or injected rules.
 */
export async function generateAnswer(
  cfg: AiConfig,
  e: Exercise,
  requestRaw: string,
  profile: AiProfile,
  opts: GenerateOpts = {},
  notes = "",
): Promise<string> {
  const messages = await buildMessages(e, requestRaw, profile, notes);

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

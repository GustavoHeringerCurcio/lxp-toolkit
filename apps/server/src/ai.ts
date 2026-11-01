import { createHash } from "node:crypto";
import OpenAI from "openai";
import type { AiConfig, AiProfile, Exercise } from "./types.js";
import { openaiKey } from "./config.js";
import { buildAiAttachments, type BuiltAttachments } from "./attachments.js";
import { buildMessages, resolveExtraInstructions, type ChatMessage } from "./prompt.js";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: openaiKey() });
  return _client;
}

/** Low temperature used for deterministic template-fill generation. */
export const TEMPLATE_TEMPERATURE = 0.2;

export interface GenerateOpts {
  onDelta?: (text: string) => void;
  /** Generic template-fill mode (professor-provided table/model). */
  wantsTemplate?: boolean;
  templateFields?: string[];
  /** Course main project block to ground a template fill. */
  projectBlock?: string;
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
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Readable prompt (no file bytes), for `ai_run` provenance and debug logs.
 * Base64 attachment payloads are replaced by markers so the DB never stores
 * megabytes of file data.
 */
function serializeMessages(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const body =
        typeof m.content === "string"
          ? m.content
          : m.content
              .map((p) =>
                p.type === "text" ? p.text : p.type === "file" ? `[pdf: ${p.file.filename}]` : "[imagem]",
              )
              .join("\n");
      return `[${m.role}]\n${body}`;
    })
    .join("\n\n");
}

/** Stable hash that includes the attachment content without serializing it into the prompt. */
function hashMessages(messages: ChatMessage[]): string {
  const h = createHash("sha256");
  for (const m of messages) {
    h.update(`${m.role}\u0000`);
    if (typeof m.content === "string") {
      h.update(m.content);
    } else {
      for (const part of m.content) {
        if (part.type === "text") h.update(part.text);
        else if (part.type === "file") h.update(`file:${part.file.filename}:${sha256(part.file.file_data)}`);
        else h.update(`image:${sha256(part.image_url.url)}`);
        h.update("\u0000");
      }
    }
  }
  return h.digest("hex");
}

/** A 400 that mentions files/images means the model cannot take attachments. */
function isAttachmentRejection(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  if (status !== 400) return false;
  const message = err instanceof Error ? err.message : String(err);
  return /file|image|content|unsupported|vision|pdf|attachment/i.test(message);
}

async function streamCompletion(
  model: string,
  temperature: number,
  maxTokens: number,
  messages: ChatMessage[],
  onDelta?: (text: string) => void,
): Promise<{ text: string; tokensIn: number | null; tokensOut: number | null }> {
  const stream = await client().chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  });

  let text = "";
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      text += delta;
      onDelta?.(delta);
    }
    if (chunk.usage) {
      tokensIn = chunk.usage.prompt_tokens ?? tokensIn;
      tokensOut = chunk.usage.completion_tokens ?? tokensOut;
    }
  }
  return { text, tokensIn, tokensOut };
}

export async function generateAnswer(
  cfg: AiConfig,
  e: Exercise,
  extraInstructions: string,
  profile: AiProfile,
  opts: GenerateOpts = {},
  notes = "",
): Promise<GeneratedAnswer> {
  // Only upload tasks with the "arquivos" section enabled carry files.
  const built: BuiltAttachments | null =
    cfg.readAttachments === false || e.kind !== "upload" || cfg.activitySections.arquivos === false
      ? null
      : await buildAiAttachments(e.files).catch(() => null);

  const base = {
    wantsTemplate: opts.wantsTemplate,
    templateFields: opts.templateFields,
    projectBlock: opts.projectBlock,
  };
  const buildWith = (withAttachments: boolean) =>
    buildMessages(e, profile, cfg.style, cfg.activitySections, resolveExtraInstructions(extraInstructions), notes, {
      ...base,
      ...(withAttachments && built
        ? {
            attachments: built.parts,
            attachedNames: built.attachedNames,
            skippedAttachments: built.skipped,
          }
        : {}),
    });

  const hasAttachments = Boolean(built?.parts.length);
  let messages = await buildWith(hasAttachments);

  // Structured "fill the professor's template" tasks are deterministic, so use
  // a low temperature instead of the (higher) free-form default to curb invented
  // fields, actors and business rules.
  const temperature = opts.wantsTemplate ? TEMPLATE_TEMPERATURE : cfg.temperature;
  const maxTokens = cfg.max_output_tokens ?? 2200;

  let result: { text: string; tokensIn: number | null; tokensOut: number | null };
  try {
    result = await streamCompletion(cfg.models.generation, temperature, maxTokens, messages, opts.onDelta);
  } catch (err) {
    // Text-only models (or a provider without file support) keep working: retry
    // once without the attachments, using the extracted text instead.
    if (!hasAttachments || !isAttachmentRejection(err)) throw err;
    messages = await buildWith(false);
    result = await streamCompletion(cfg.models.generation, temperature, maxTokens, messages, opts.onDelta);
  }

  return {
    text: result.text,
    model: cfg.models.generation,
    prompt: serializeMessages(messages),
    promptHash: hashMessages(messages),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}

/**
 * Default cheapest catalog model, used when a role has no explicit model.
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
 * One small JSON completion on the given model, falling back to the configured
 * generation model when the chosen one is unavailable. Shared by every
 * lightweight structured call (detection, classification, diagram, gate).
 */
export async function cheapJsonCompletion(
  cfg: AiConfig,
  system: string,
  user: string,
  maxTokens = 700,
  /** Role model to use; defaults to the cheap detection model. */
  model: string = cfg.models?.detection ?? DETECT_MODEL,
): Promise<{ text: string; model: string }> {
  const attempt = async (m: string): Promise<string> => {
    const resp = await client().chat.completions.create({
      model: m,
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
  const fallback = cfg.models?.generation ?? cfg.model;
  try {
    return { text: await attempt(model), model };
  } catch {
    if (model === fallback) throw new Error(`falha ao chamar o modelo ${model}`);
    return { text: await attempt(fallback), model: fallback };
  }
}

export interface ProposedProject {
  theme: string;
  atores: string[];
  requisitos: string[];
}

export interface ActivityRelevance {
  needsProject: boolean;
  /** True when the activity asks to fill a professor-provided template/table. */
  wantsTemplate: boolean;
  /** Field labels the professor wants filled, in order (empty when none). */
  templateFields: string[];
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
 * and/or asks the student to fill a professor-provided template/table. Cheap
 * and conservative: one short JSON completion.
 */
export async function detectActivityRelevance(
  cfg: AiConfig,
  e: Exercise,
  notes = "",
): Promise<ActivityRelevance> {
  const system =
    "Você decide duas coisas sobre uma atividade acadêmica. " +
    "1) Se ela exige que o aluno escolha ou use um PROJETO (tema + atores + requisitos), " +
    "por exemplo \"preencha a tabela do seu projeto\", \"caso de uso do seu sistema\", " +
    "\"escolha um tema\", \"com base no projeto do seu grupo\". " +
    "2) Se ela pede para PREENCHER UM MODELO/TABELA fornecido pelo professor, por exemplo " +
    "\"preencha a tabela\", \"complete o quadro\", \"siga o modelo\", \"preencha os campos\", " +
    "\"preencha o quadro abaixo\". " +
    "Responda SOMENTE com um objeto JSON, sem texto ao redor, no formato " +
    '{"needsProject": boolean, "wantsTemplate": boolean, "templateFields": string[], ' +
    '"confidence": number, "intent": string, "reason": string, ' +
    '"proposedTheme": string, "proposedAtores": string[], "proposedRequisitos": string[]}. ' +
    "`intent` resume em uma frase o que a atividade pede. " +
    "`wantsTemplate` é true quando a atividade pede para preencher um modelo/tabela com campos definidos. " +
    "`templateFields` são os RÓTULOS exatos dos campos/colunas que o professor quer preenchidos, na ordem em que aparecem " +
    "(deixe vazio quando não houver um modelo claro). " +
    "`proposedTheme`/`proposedAtores`/`proposedRequisitos` " +
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

  const { text, model } = await cheapJsonCompletion(cfg, system, user, 600, cfg.models.detection);
  const parsed = safeParse(text);
  const proposedTheme = str(parsed.proposedTheme);
  const proposedAtores = strArr(parsed.proposedAtores);
  const proposedRequisitos = strArr(parsed.proposedRequisitos);
  return {
    needsProject: parsed.needsProject === true,
    wantsTemplate: parsed.wantsTemplate === true,
    templateFields: strArr(parsed.templateFields),
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

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
    {
      wantsTemplate: opts.wantsTemplate,
      templateFields: opts.templateFields,
      projectBlock: opts.projectBlock,
    },
  );

  // Structured "fill the professor's template" tasks are deterministic, so use
  // a low temperature instead of the (higher) free-form default to curb invented
  // fields, actors and business rules.
  const temperature = opts.wantsTemplate ? TEMPLATE_TEMPERATURE : cfg.temperature;
  const stream = await client().chat.completions.create({
    model: cfg.models.generation,
    temperature,
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
    model: cfg.models.generation,
    prompt,
    promptHash: createHash("sha256").update(JSON.stringify(messages)).digest("hex"),
    tokensIn,
    tokensOut,
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

  const { text, model } = await cheapJsonCompletion(cfg, system, user, 700, cfg.models.detection);
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

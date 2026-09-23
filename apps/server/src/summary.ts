/**
 * Resumo ("summary") — the AI side.
 *
 * Aggregates a whole subject (course, or course + module) from Postgres — the
 * extracted PDF/reading material (`content_text`) plus the real quiz bank — and
 * writes a medium-size study summary in markdown, ending with the strongest
 * likely exam questions.
 *
 * Large subjects are handled map-reduce style: the material is packed into
 * context-sized chunks (by tópico), each chunk is turned into dense revision
 * notes, then one final streamed pass combines the notes into the Resumo. Small
 * subjects skip the map phase and stream directly.
 *
 * The output is saved by `summary-store.ts`; this module never touches the DB.
 */
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { openaiKey } from "./config.js";
import { getAiConfig } from "./store.js";
import type { AiConfig, SummaryItem, SummarySize } from "./types.js";
import type { AiProvenance, ChatMessage, ContextItem, ContextQuestion, SubjectContext } from "./training.js";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: openaiKey() });
  return _client;
}

// Mirror the Treino caps: cover breadth (many items) rather than a few huge files.
const MAX_CONTEXT_CHARS = 60_000;
const MAX_ITEM_CHARS = 6_000;
// Keep the final prompt grounded in the real bank, but bounded.
const MAX_QUESTIONS_IN_PROMPT = 60;

// ── Output sizes ────────────────────────────────────────────────────────────

export const SUMMARY_SIZES: SummarySize[] = ["small", "medium", "big", "extra"];

export interface SummarySizeProfile {
  /** Cap for the final streamed call. */
  maxTokens: number;
  /** Approximate number of likely-exam questions to include. */
  questions: number;
  /** Length/shape instruction appended to the prompt. */
  guide: string;
}

export const SIZE_PROFILES: Record<SummarySize, SummarySizeProfile> = {
  small: {
    maxTokens: 1300,
    questions: 4,
    guide:
      "Tamanho ALVO: curto, cerca de 1 página. Foque só no essencial: 5 a 8 tópicos-chave, " +
      "os conceitos centrais e poucas pegadinhas.",
  },
  medium: {
    maxTokens: 2400,
    questions: 8,
    guide: "Tamanho ALVO: médio, 2 a 3 páginas. Equilibre cobertura e objetividade.",
  },
  big: {
    maxTokens: 4200,
    questions: 14,
    guide:
      "Tamanho ALVO: longo, 4 a 6 páginas. Aprofunde cada tópico com definições, relações e exemplos.",
  },
  extra: {
    maxTokens: 6500,
    questions: 20,
    guide:
      "Tamanho ALVO: bem longo, 6 páginas ou mais. Cobertura quase completa do material, " +
      "detalhando cada tópico com exemplos e comparações.",
  },
};

export function isSummarySize(value: unknown): value is SummarySize {
  return typeof value === "string" && (SUMMARY_SIZES as string[]).includes(value);
}

export function normalizeSummarySize(value: unknown): SummarySize {
  return isSummarySize(value) ? value : "medium";
}

/**
 * Some models wrap the whole answer in a ```markdown fence (mostly on the
 * longer sizes). Strip a single outer fence so the saved markdown renders
 * normally in the UI and in the PDF.
 */
export function normalizeSummaryMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const lines = trimmed.split("\n");
  if (!/^```[a-zA-Z0-9_-]*$/.test(lines[0].trim())) return trimmed;
  if (lines[lines.length - 1].trim() !== "```") return trimmed;
  const inner = lines.slice(1, -1).join("\n");
  if (inner.includes("```")) return trimmed; // real multi-block content — keep
  return inner.trim();
}

// ── Context chunking (pure) ─────────────────────────────────────────────────

export interface SummaryChunk {
  /** Module name(s) covered by the chunk ("Geral" when course-level). */
  label: string;
  text: string;
  itemCount: number;
}

/** Render one content item as a material block (material capped per item). */
export function buildItemBlock(item: ContextItem, maxItemChars = MAX_ITEM_CHARS): string {
  const parts: string[] = [`==== ${item.title} [${item.kind}] ====`];
  if (item.moduleName) {
    parts.push(`Módulo: ${item.moduleName}${item.sectionTitle ? ` · ${item.sectionTitle}` : ""}`);
  }
  if (item.instructions) parts.push(`Instruções: ${item.instructions}`);
  if (item.material) parts.push(item.material.slice(0, maxItemChars));
  if (item.questions.length) {
    const lines = ["Questões do quiz:"];
    for (const q of item.questions) {
      lines.push(`  Q${q.id}. ${q.text}`);
      q.options.forEach((opt, i) => lines.push(`     ${String.fromCharCode(97 + i)}) ${opt}`));
    }
    parts.push(lines.join("\n"));
  }
  if (item.fileNames.length) parts.push(`Arquivos: ${item.fileNames.join(", ")}`);
  return parts.join("\n");
}

/**
 * Pack the subject's items into context-sized chunks. Consecutive items (and
 * therefore tópicos) are batched until the next block would exceed `maxChars`,
 * so a small module is not a wasted call while a huge one still splits cleanly.
 */
export function chunkItems(
  items: ContextItem[],
  maxChars = MAX_CONTEXT_CHARS,
  maxItemChars = MAX_ITEM_CHARS,
): SummaryChunk[] {
  const chunks: SummaryChunk[] = [];
  let blocks: string[] = [];
  let size = 0;
  let labels: string[] = [];
  let itemCount = 0;

  const flush = () => {
    if (!blocks.length) return;
    chunks.push({
      label: labels.length ? [...new Set(labels)].join(" · ") : "Geral",
      text: blocks.join("\n\n"),
      itemCount,
    });
    blocks = [];
    size = 0;
    labels = [];
    itemCount = 0;
  };

  for (const item of items) {
    const block = buildItemBlock(item, maxItemChars);
    if (size > 0 && size + block.length > maxChars) flush();
    blocks.push(block);
    size += block.length;
    itemCount++;
    labels.push(item.moduleName ?? "Geral");
  }
  flush();
  return chunks;
}

/** Compact snapshot of the items that fed a summary (transparency). */
export function summarizeItems(items: ContextItem[]): SummaryItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    kind: item.kind,
    moduleName: item.moduleName,
    sectionTitle: item.sectionTitle,
    files: item.fileNames,
    questions: item.questions.length,
    hidden: item.hidden === true,
  }));
}

// ── Prompt building (pure) ──────────────────────────────────────────────────

function expertSystem(ctx: SubjectContext, tail: string): string {
  return (
    `Você é um professor especialista em ${ctx.courseName}` +
    (ctx.moduleName ? `, no tópico "${ctx.moduleName}"` : "") +
    `. ${tail} Baseie-se estritamente no material fornecido; não invente fatos que não estejam nele. ` +
    `Responda em português (pt-BR).`
  );
}

/** Per-chunk "extract the exam-relevant notes" prompt (map phase). */
export function buildPartialMessages(ctx: SubjectContext, chunk: SummaryChunk): ChatMessage[] {
  const system = expertSystem(
    ctx,
    `Você monta material de revisão para a prova a partir do conteúdo real do curso.`,
  );
  const user =
    `Trecho do material (${chunk.label}):\n${chunk.text}\n\n` +
    `Tarefa: extraia as informações mais importantes para a prova deste trecho — ` +
    `conceitos, definições, classificações, relações, exemplos e pegadinhas. ` +
    `Devolva bullets curtos e densos, sem introdução nem despedida.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function questionsBlock(questions: ContextQuestion[]): string {
  if (questions.length === 0) return "";
  const lines = questions.slice(0, MAX_QUESTIONS_IN_PROMPT).map((q) => {
    const opts = q.options.map((o, i) => `   ${String.fromCharCode(97 + i)}) ${o}`).join("\n");
    return `Q${q.id}. ${q.text}${opts ? `\n${opts}` : ""}`;
  });
  return (
    `Banco de questões já visto no curso (use como referência do estilo e dos temas):\n` +
    `${lines.join("\n")}\n\n`
  );
}

/** Final "write the medium study Resumo" prompt (combine phase). */
export function buildFinalSummaryMessages(
  ctx: SubjectContext,
  materialText: string,
  size: SummarySize = "medium",
): ChatMessage[] {
  const profile = SIZE_PROFILES[size];
  const system = expertSystem(
    ctx,
    `Você escreve um resumo de estudo de tamanho médio para a prova.`,
  );
  const user =
    `Material consolidado do curso:\n${materialText}\n\n` +
    questionsBlock(ctx.questions) +
    `Tarefa: escreva um RESUMO de estudo, em markdown simples, ` +
    `priorizando o que tem mais chance de cair na prova. ${profile.guide} ` +
    `Use exatamente estas seções:\n` +
    `## Visão geral\n` +
    `## Tópicos-chave\n` +
    `## Conceitos que mais caem\n` +
    `## Questões prováveis\n` +
    `(para cada uma: a pergunta, a resposta correta em uma linha e o porquê em uma linha; ` +
    `inclua cerca de ${profile.questions} questões)\n` +
    `## Pegadinhas\n\n` +
    `Seja específico e fiel ao material. Não repita as instruções nem escreva introdução ou despedida. ` +
    `Escreva o markdown direto, sem cercas de código (nada de \`\`\`).`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ── OpenAI calls ────────────────────────────────────────────────────────────

function serializePrompt(messages: ChatMessage[]): string {
  return messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
}

function promptHash(messages: ChatMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

async function partialCompletion(
  messages: ChatMessage[],
  cfg: AiConfig,
): Promise<{ text: string; provenance: AiProvenance }> {
  const completion = await client().chat.completions.create({
    model: cfg.models.training,
    temperature: cfg.temperature,
    max_tokens: Math.min(1600, cfg.max_output_tokens ?? 1600),
    messages,
  });
  const text = completion.choices?.[0]?.message?.content ?? "";
  return {
    text,
    provenance: {
      model: cfg.models.training,
      prompt: serializePrompt(messages),
      promptHash: promptHash(messages),
      tokensIn: completion.usage?.prompt_tokens ?? null,
      tokensOut: completion.usage?.completion_tokens ?? null,
    },
  };
}

async function streamCompletion(
  messages: ChatMessage[],
  cfg: AiConfig,
  onDelta?: (delta: string) => void,
  maxTokens?: number,
): Promise<{ text: string; provenance: AiProvenance }> {
  const stream = await client().chat.completions.create({
    model: cfg.models.training,
    temperature: cfg.temperature,
    max_tokens: maxTokens ?? cfg.max_output_tokens ?? 4000,
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
      onDelta?.(delta);
    }
    if (chunk.usage) {
      tokensIn = chunk.usage.prompt_tokens ?? tokensIn;
      tokensOut = chunk.usage.completion_tokens ?? tokensOut;
    }
  }

  return {
    text: full,
    provenance: {
      model: cfg.models.training,
      prompt: serializePrompt(messages),
      promptHash: promptHash(messages),
      tokensIn,
      tokensOut,
    },
  };
}

// ── Orchestration ───────────────────────────────────────────────────────────

export interface SummaryStep {
  phase: "map" | "combine";
  /** 0-based position within the phase. */
  index: number;
  total: number;
  label: string;
}

export interface GenerateSummaryOptions {
  size?: SummarySize;
  onDelta?: (delta: string) => void;
  onStep?: (step: SummaryStep) => void;
}

export interface GeneratedSummary {
  content: string;
  size: SummarySize;
  model: string;
  promptHash: string;
  itemCount: number;
  items: SummaryItem[];
  provenances: AiProvenance[];
}

/** True when the subject is small enough for a single streamed pass. */
export function isSinglePass(
  items: ContextItem[],
  maxChars = MAX_CONTEXT_CHARS,
  maxItemChars = MAX_ITEM_CHARS,
): boolean {
  const total = items.reduce((n, item) => n + buildItemBlock(item, maxItemChars).length, 0);
  return total <= maxChars;
}

/**
 * Generate the Resumo for a subject: map (notes per chunk) then reduce (one
 * streamed summary). Small subjects stream in a single call.
 */
export async function generateResumo(
  ctx: SubjectContext,
  opts: GenerateSummaryOptions = {},
  cfg?: AiConfig,
): Promise<GeneratedSummary> {
  if (ctx.items.length === 0) {
    throw new Error("Sem conteúdo para resumir. Sincronize o material do portal.");
  }
  const config = cfg ?? (await getAiConfig());
  const size = normalizeSummarySize(opts.size);
  const chunks = chunkItems(ctx.items);
  const provenances: AiProvenance[] = [];

  let materialText: string;
  if (chunks.length <= 1) {
    materialText = chunks[0]?.text ?? "";
  } else {
    const partials: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      opts.onStep?.({ phase: "map", index: i, total: chunks.length, label: chunk.label });
      const messages = buildPartialMessages(ctx, chunk);
      const { text, provenance } = await partialCompletion(messages, config);
      provenances.push(provenance);
      if (text.trim()) partials.push(`### ${chunk.label}\n${text.trim()}`);
    }
    materialText = partials.join("\n\n");
  }

  opts.onStep?.({ phase: "combine", index: 0, total: 1, label: ctx.moduleName ?? ctx.courseName });
  const messages = buildFinalSummaryMessages(ctx, materialText, size);
  const { text, provenance } = await streamCompletion(
    messages,
    config,
    opts.onDelta,
    SIZE_PROFILES[size].maxTokens,
  );
  provenances.push(provenance);

  const content = normalizeSummaryMarkdown(text);
  if (!content) throw new Error("A IA não retornou o resumo.");
  return {
    content,
    size,
    model: provenance.model,
    promptHash: provenance.promptHash,
    itemCount: ctx.items.length,
    items: summarizeItems(ctx.items),
    provenances,
  };
}

/**
 * Training ("Treino") — the AI side.
 *
 * Builds a per-subject knowledge pack straight from Postgres (catalog + question
 * bank + the precomputed `content_text` material) and turns it into practice
 * quizzes — AI-authored or "mixed" (real portal questions + AI fill) — and
 * streamed study guides.
 *
 * The portal exposes very few quizzes, so the real corpus is the extracted
 * readings/PDFs in `content_text`; nothing here reads the `exercises.json`
 * cache (it only holds actionable items and drops readings).
 */
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { openaiKey } from "./config.js";
import { query } from "./db.js";
import { getAiConfig } from "./store.js";
import { stripHtml } from "./build.js";
import { getClassifyMaps, listExams } from "./exam-store.js";
import { resolveCourseExams } from "./exams.js";
import type { AiConfig, TrainingSubject, TrainingModuleInfo } from "./types.js";
import type { NewTrainingQuestion } from "./training-store.js";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: openaiKey() });
  return _client;
}

// Context caps: cover breadth (many items) rather than a few huge files.
const MAX_CONTEXT_CHARS = 60_000;
const MAX_ITEM_CHARS = 6_000;

export interface ContextQuestion {
  id: number;
  text: string;
  options: string[];
  itemId: number;
  itemTitle: string;
}

export interface ContextItem {
  id: number;
  title: string;
  kind: string;
  moduleName: string | null;
  sectionTitle: string | null;
  instructions: string;
  /** Precomputed material text (extracted PDF/reading), when available. */
  material: string;
  questions: ContextQuestion[];
  fileNames: string[];
}

export interface SubjectContext {
  courseId: number;
  courseName: string;
  moduleId: number | null;
  moduleName: string | null;
  items: ContextItem[];
  /** All questions across the scope, flattened (mixed mode draws from these). */
  questions: ContextQuestion[];
  text: string;
}

export interface AiProvenance {
  model: string;
  prompt: string;
  promptHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

// ── Subject catalog ─────────────────────────────────────────────────────────

interface CourseCountRow {
  id: string;
  name: string;
  item_count: string;
  quiz_count: string;
  reading_count: string;
}

interface ModuleCountRow {
  course_id: string;
  id: string;
  name: string | null;
  title: string;
  item_count: string;
  quiz_count: string;
  reading_count: string;
  tree_count: string;
  prof_count: string;
}

const READING_KINDS = "('pdf','reading')";

/**
 * Hidden ("God's Eye") topics are only studied/counted when they are not a
 * duplicate of a tree item — except when they carry questions (unique question
 * banks live inside duplicate-titled items too). Duplicate readings/material
 * are dropped; every real question is kept.
 */
export const VISIBLE_ITEM_SQL =
  "(ci.origin = 'tree' OR (ci.origin = 'hidden' AND (" +
  "COALESCE((ci.raw_json->>'duplicate')::boolean, false) = false " +
  "OR EXISTS (SELECT 1 FROM question q WHERE q.content_item_id = ci.id))))";

/** A module is a real subject when it has a professor or a substantial tree. */
export function isSubjectModule(profCount: number, treeCount: number): boolean {
  return profCount > 0 || treeCount >= 10;
}

/** Courses + modules with content counts, for the subject picker. */
export async function listTrainingSubjects(): Promise<TrainingSubject[]> {
  const [courses, modules] = await Promise.all([
    query<CourseCountRow>(
      `SELECT c.id, c.name,
         (SELECT count(*) FROM content_item ci
           WHERE ci.course_id = c.id AND ${VISIBLE_ITEM_SQL}) AS item_count,
         (SELECT count(*) FROM content_item ci
           WHERE ci.course_id = c.id AND ci.kind = 'quiz' AND ${VISIBLE_ITEM_SQL}) AS quiz_count,
         (SELECT count(*) FROM content_item ci
           WHERE ci.course_id = c.id AND ci.kind IN ${READING_KINDS} AND ${VISIBLE_ITEM_SQL}) AS reading_count
       FROM course c
       ORDER BY c.name`,
    ),
    query<ModuleCountRow>(
      `SELECT m.course_id, m.id, m.name, m.title,
         count(ci.id) FILTER (WHERE ${VISIBLE_ITEM_SQL}) AS item_count,
         count(ci.id) FILTER (WHERE ci.kind = 'quiz' AND ${VISIBLE_ITEM_SQL}) AS quiz_count,
         count(ci.id) FILTER (WHERE ci.kind IN ${READING_KINDS} AND ${VISIBLE_ITEM_SQL}) AS reading_count,
         count(ci.id) FILTER (WHERE ci.origin = 'tree') AS tree_count,
         (SELECT count(*) FROM module_professor mp WHERE mp.module_id = m.id) AS prof_count
       FROM module m
       LEFT JOIN content_item ci ON ci.module_id = m.id
       GROUP BY m.course_id, m.id, m.name, m.title, m.sequence
       ORDER BY m.sequence NULLS LAST, m.title`,
    ),
  ]);

  const byCourse = new Map<string, TrainingModuleInfo[]>();
  for (const m of modules) {
    const list = byCourse.get(m.course_id) ?? [];
    const treeCount = Number(m.tree_count);
    const profCount = Number(m.prof_count);
    list.push({
      moduleId: Number(m.id),
      moduleName: m.name ?? m.title,
      itemCount: Number(m.item_count),
      quizCount: Number(m.quiz_count),
      readingCount: Number(m.reading_count),
      treeCount,
      isSubject: isSubjectModule(profCount, treeCount),
    });
    byCourse.set(m.course_id, list);
  }

  // Real subjects first, then the exam/phantom modules; alphabetical within each.
  for (const list of byCourse.values()) {
    list.sort(
      (a, b) =>
        Number(b.isSubject) - Number(a.isSubject) ||
        a.moduleName.localeCompare(b.moduleName, "pt"),
    );
  }

  return courses.map((c) => ({
    courseId: Number(c.id),
    courseName: c.name,
    itemCount: Number(c.item_count),
    quizCount: Number(c.quiz_count),
    readingCount: Number(c.reading_count),
    modules: byCourse.get(c.id) ?? [],
  }));
}

// ── Knowledge pack ──────────────────────────────────────────────────────────

interface ItemRow {
  id: string;
  title: string;
  kind: string;
  html: string | null;
  raw_json: { html?: string | null; content?: Record<string, unknown> | null } | null;
  module_id: string | null;
  module_name: string | null;
  section_id: string | null;
  section_title: string | null;
  gradebook_id: string | null;
  deadline_at: Date | null;
  material: string | null;
  material_status: string | null;
}

interface QuestionRow {
  id: string;
  content_item_id: string;
  text: string;
  position: number;
  option_text: string | null;
}

interface AttachmentRow {
  content_item_id: string;
  filename: string | null;
}

function instructionsFor(row: ItemRow): string {
  const html = row.html ?? row.raw_json?.html ?? null;
  let text = stripHtml(html);
  if (!text && row.raw_json?.content) {
    const raw = row.raw_json.content.instructions;
    if (typeof raw === "string") text = stripHtml(raw);
  }
  return text;
}

/** Assemble the subject knowledge pack from Postgres (catalog + material + bank). */
export async function buildSubjectContext(
  courseId: number,
  moduleId?: number | null,
  examId?: number | null,
): Promise<SubjectContext> {
  const courseRows = await query<{ id: string; name: string }>(
    "SELECT id, name FROM course WHERE id = $1",
    [courseId],
  );
  if (courseRows.length === 0) throw new Error(`curso ${courseId} não encontrado`);
  const courseName = courseRows[0].name;

  const moduleName = moduleId
    ? (
        await query<{ name: string | null; title: string }>(
          "SELECT name, title FROM module WHERE id = $1",
          [moduleId],
        )
      )[0]
    : undefined;

  const params: unknown[] = [courseId];
  let moduleClause = "";
  if (moduleId) {
    moduleClause = "AND ci.module_id = $2";
    params.push(moduleId);
  }

  const rows = await query<ItemRow>(
    `SELECT ci.id, ci.title, ci.kind, ci.html, ci.raw_json, ci.deadline_at, ci.gradebook_id,
            ci.module_id, ci.section_id,
            m.name AS module_name, s.title AS section_title,
            ct.text AS material, ct.status AS material_status
     FROM content_item ci
     LEFT JOIN module m ON m.id = ci.module_id
     LEFT JOIN section s ON s.id = ci.section_id
     LEFT JOIN content_text ct ON ct.content_item_id = ci.id
     WHERE ci.course_id = $1 ${moduleClause} AND ${VISIBLE_ITEM_SQL}
     ORDER BY m.sequence NULLS LAST, ci.id`,
    params,
  );

  // Scope to the current exam: keep items assigned to it plus neutral material.
  let items = rows;
  if (examId != null) {
    const exams = await listExams(courseId);
    const maps = await getClassifyMaps(courseId, exams);
    const resolved = resolveCourseExams(
      rows.map((r) => ({
        id: Number(r.id),
        moduleId: r.module_id != null ? Number(r.module_id) : null,
        moduleTitle: r.module_name,
        sectionId: r.section_id != null ? Number(r.section_id) : null,
        sectionTitle: r.section_title,
        gradebookId: r.gradebook_id != null ? Number(r.gradebook_id) : null,
        deadlineAt: r.deadline_at ? r.deadline_at.toISOString() : null,
      })),
      exams,
      maps,
    );
    items = rows.filter((r) => {
      const res = resolved.get(Number(r.id));
      return !res || res.examId == null || res.examId === examId;
    });
  }

  const itemIds = items.map((i) => Number(i.id));
  const [questionRows, attachmentRows] = itemIds.length
    ? await Promise.all([
        query<QuestionRow>(
          `SELECT q.id, q.content_item_id, q.text, q.position, o.text AS option_text
           FROM question q
           LEFT JOIN question_option o ON o.question_id = q.id
           WHERE q.content_item_id = ANY($1::bigint[])
           ORDER BY q.content_item_id, q.position, o.position`,
          [itemIds],
        ),
        query<AttachmentRow>(
          "SELECT content_item_id, filename FROM attachment WHERE content_item_id = ANY($1::bigint[]) ORDER BY id",
          [itemIds],
        ),
      ])
    : [[], []];

  const questionsByItem = new Map<number, ContextQuestion[]>();
  for (const r of questionRows) {
    const itemId = Number(r.content_item_id);
    const list = questionsByItem.get(itemId) ?? [];
    let q = list.find((x) => x.id === Number(r.id));
    if (!q) {
      q = { id: Number(r.id), text: r.text, options: [], itemId, itemTitle: "" };
      list.push(q);
      questionsByItem.set(itemId, list);
    }
    if (r.option_text != null) q.options.push(r.option_text);
  }

  const filesByItem = new Map<number, string[]>();
  for (const a of attachmentRows) {
    if (!a.filename) continue;
    const list = filesByItem.get(Number(a.content_item_id)) ?? [];
    list.push(a.filename);
    filesByItem.set(Number(a.content_item_id), list);
  }

  const ctxItems: ContextItem[] = [];
  const allQuestions: ContextQuestion[] = [];
  const blocks: string[] = [];
  let size = 0;

  for (const row of items) {
    const id = Number(row.id);
    const questions = questionsByItem.get(id) ?? [];
    for (const q of questions) q.itemTitle = row.title;
    allQuestions.push(...questions);

    const instructions = instructionsFor(row);
    const material = (row.material ?? "").trim();
    const item: ContextItem = {
      id,
      title: row.title,
      kind: row.kind,
      moduleName: row.module_name,
      sectionTitle: row.section_title,
      instructions,
      material,
      questions,
      fileNames: filesByItem.get(id) ?? [],
    };
    ctxItems.push(item);

    if (size >= MAX_CONTEXT_CHARS) continue;
    const parts: string[] = [`==== ${row.title} [${row.kind}] ====`];
    if (row.module_name) parts.push(`Módulo: ${row.module_name}${row.section_title ? ` · ${row.section_title}` : ""}`);
    if (instructions) parts.push(`Instruções: ${instructions}`);
    if (material) parts.push(material.slice(0, MAX_ITEM_CHARS));
    if (questions.length) {
      const lines = ["Questões do quiz:"];
      for (const q of questions) {
        lines.push(`  Q${q.id}. ${q.text}`);
        q.options.forEach((opt, i) => lines.push(`     ${String.fromCharCode(97 + i)}) ${opt}`));
      }
      parts.push(lines.join("\n"));
    }
    if (item.fileNames.length) parts.push(`Arquivos: ${item.fileNames.join(", ")}`);

    const block = parts.join("\n");
    if (size + block.length > MAX_CONTEXT_CHARS) {
      const room = MAX_CONTEXT_CHARS - size;
      if (room > 500) blocks.push(block.slice(0, room) + "\n…[truncado]");
      break;
    }
    blocks.push(block);
    size += block.length;
  }

  const header = [
    `CURSO: ${courseName}`,
    moduleName ? `MÓDULO: ${moduleName.name ?? moduleName.title}` : "ESCOPO: curso inteiro",
    `ITENS: ${ctxItems.length}`,
  ].join("\n");

  return {
    courseId,
    courseName,
    moduleId: moduleId ?? null,
    moduleName: moduleName ? moduleName.name ?? moduleName.title : null,
    items: ctxItems,
    questions: allQuestions,
    text: `${header}\n\n${blocks.join("\n\n")}`,
  };
}

export function subjectLabel(ctx: Pick<SubjectContext, "courseName" | "moduleName">): string {
  return ctx.moduleName ? `${ctx.courseName} · ${ctx.moduleName}` : ctx.courseName;
}

// ── Prompt building (pure) ──────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export function buildQuizMessages(
  ctx: SubjectContext,
  mode: "ai" | "mixed",
  count: number,
  portal: ContextQuestion[] = [],
): ChatMessage[] {
  const system =
    `Você é um professor especialista em ${ctx.courseName}` +
    (ctx.moduleName ? `, no tópico "${ctx.moduleName}"` : "") +
    `. Você prepara um aluno para a prova usando o material real do curso. ` +
    `Baseie as questões estritamente no material fornecido; não invente fatos que não estejam nele. ` +
    `Responda sempre em português (pt-BR) e SOMENTE com JSON válido.`;

  if (mode === "mixed" && portal.length > 0) {
    const lines: string[] = [];
    for (const q of portal) {
      lines.push(`Q${q.id}. ${q.text}`);
      q.options.forEach((opt, i) => lines.push(`   ${String.fromCharCode(97 + i)}) ${opt}`));
    }
    const user =
      `Material do curso:\n${ctx.text}\n\n` +
      `Tarefa: para cada questão do próprio curso listada abaixo, determine a alternativa correta ` +
      `e escreva uma explicação curta, com base no material.\n\n` +
      `${lines.join("\n")}\n\n` +
      `Responda SOMENTE com JSON no formato: ` +
      `{"answers":[{"id":<id da questão>,"answerIndex":<índice 0-based da alternativa correta>,"explanation":"..."}]}`;
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  const user =
    `Material do curso:\n${ctx.text}\n\n` +
    `Tarefa: crie exatamente ${count} questões de múltipla escolha no estilo da prova, ` +
    `priorizando os tópicos mais prováveis de cair no exame. Cada questão deve ter 4 alternativas ` +
    `(a-d) e exatamente uma correta, além de uma explicação curta.\n\n` +
    `Responda SOMENTE com JSON no formato: ` +
    `{"title":"...","questions":[{"text":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Pick up to `count` portal questions across the scope (random order). */
export function selectPortalQuestions(questions: ContextQuestion[], count: number): ContextQuestion[] {
  const pool = questions.filter((q) => q.options.length >= 2);
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, Math.max(1, count));
}

/** How many questions come from the portal vs the AI, for the requested count. */
export function planGeneration(
  mode: "ai" | "mixed",
  availableReal: number,
  count: number,
): { realCount: number; aiCount: number } {
  const realCount = mode === "mixed" ? Math.min(Math.max(availableReal, 0), count) : 0;
  return { realCount, aiCount: Math.max(count - realCount, 0) };
}

// ── Response normalization (pure) ───────────────────────────────────────────

function safeJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function optionTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((o) => {
      if (o && typeof o === "object") {
        const t = (o as Record<string, unknown>).text;
        return typeof t === "string" ? t : "";
      }
      return typeof o === "string" ? o : "";
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAnswerIndex(value: unknown, optionCount: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < optionCount) {
    return value;
  }
  const s = String(value ?? "").trim().toLowerCase();
  const letter = s.match(/^\(?([a-j])\)?/);
  if (letter) {
    const idx = letter[1].charCodeAt(0) - 97;
    if (idx < optionCount) return idx;
  }
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= optionCount) return n - 1;
  return 0;
}

/** Normalize an AI-authored quiz payload into practice questions. */
export function normalizeGeneratedQuestions(raw: unknown, count: number): NewTrainingQuestion[] {
  const obj = safeJson(raw);
  const list = obj && Array.isArray(obj.questions) ? obj.questions : [];
  const out: NewTrainingQuestion[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const q = entry as Record<string, unknown>;
    const text = String(q.text ?? q.question ?? "").trim();
    const options = optionTexts(q.options);
    if (!text || options.length < 2) continue;
    const answerIndex = parseAnswerIndex(q.answerIndex ?? q.answer_index ?? q.answer ?? q.correct, options.length);
    const explanation = q.explanation != null ? String(q.explanation).trim() || null : null;
    out.push({
      text,
      options: options.map((t, i) => ({ letter: String.fromCharCode(97 + i), text: t })),
      answerIndex,
      explanation,
      sourceItemId: null,
      sourceKind: null,
    });
  }
  return out.slice(0, count > 0 ? count : out.length);
}

/** Normalize inferred answers for real portal questions into practice questions. */
export function normalizeInferredAnswers(raw: unknown, portal: ContextQuestion[]): NewTrainingQuestion[] {
  const obj = safeJson(raw);
  const list = obj && Array.isArray(obj.answers) ? obj.answers : [];
  const byId = new Map(portal.map((q) => [q.id, q]));
  const out: NewTrainingQuestion[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry as Record<string, unknown>;
    const id = Number(a.id ?? a.questionId ?? a.question_id);
    const q = byId.get(id);
    if (!q || q.options.length < 2) continue;
    const answerIndex = parseAnswerIndex(a.answerIndex ?? a.answer_index ?? a.answer ?? a.correct, q.options.length);
    const explanation = a.explanation != null ? String(a.explanation).trim() || null : null;
    out.push({
      text: q.text,
      options: q.options.map((t, i) => ({ letter: String.fromCharCode(97 + i), text: t })),
      answerIndex,
      explanation,
      sourceItemId: q.itemId,
      sourceKind: "quiz",
    });
  }
  return out;
}

// ── OpenAI calls ────────────────────────────────────────────────────────────

function serializePrompt(messages: ChatMessage[]): string {
  return messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
}

function promptHash(messages: ChatMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

async function jsonCompletion(messages: ChatMessage[], cfg: AiConfig): Promise<{ text: string; provenance: AiProvenance }> {
  const completion = await client().chat.completions.create({
    model: cfg.models.training,
    temperature: cfg.temperature,
    max_tokens: cfg.max_output_tokens ?? 4000,
    response_format: { type: "json_object" },
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

export interface GeneratedQuiz {
  title: string;
  questions: NewTrainingQuestion[];
  provenances: AiProvenance[];
}

/**
 * Generate a practice quiz for the subject. `ai` writes new questions from the
 * material; `mixed` uses the real portal questions that exist and fills the
 * remainder with AI (never fails when a module has no quizzes).
 */
export async function generateTrainingQuiz(
  ctx: SubjectContext,
  mode: "ai" | "mixed",
  count: number,
  cfg?: AiConfig,
): Promise<GeneratedQuiz> {
  const config = cfg ?? (await getAiConfig());
  const real = mode === "mixed" ? selectPortalQuestions(ctx.questions, count) : [];
  const { realCount } = planGeneration(mode, real.length, count);
  const questions: NewTrainingQuestion[] = [];
  const provenances: AiProvenance[] = [];

  if (realCount > 0) {
    const chosen = real.slice(0, realCount);
    const messages = buildQuizMessages(ctx, "mixed", realCount, chosen);
    const { text, provenance } = await jsonCompletion(messages, config);
    questions.push(...normalizeInferredAnswers(text, chosen));
    provenances.push(provenance);
  }

  const missing = count - questions.length;
  if (missing > 0) {
    const messages = buildQuizMessages(ctx, "ai", missing);
    const { text, provenance } = await jsonCompletion(messages, config);
    questions.push(...normalizeGeneratedQuestions(text, missing));
    provenances.push(provenance);
  }

  if (questions.length === 0) throw new Error("A IA não retornou questões válidas.");
  const title = realCount > 0 ? `Treino misto · ${subjectLabel(ctx)}` : `Treino · ${subjectLabel(ctx)}`;
  return { title, questions, provenances };
}

export interface StudyResult {
  text: string;
  provenance: AiProvenance;
}

/** Stream a study guide answering the student's question about the subject. */
export async function generateStudyGuide(
  ctx: SubjectContext,
  question: string,
  onDelta?: (delta: string) => void,
  cfg?: AiConfig,
): Promise<StudyResult> {
  const config = cfg ?? (await getAiConfig());
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `Você é um professor/tutor especialista em ${ctx.courseName}` +
        (ctx.moduleName ? `, no tópico "${ctx.moduleName}"` : "") +
        `. Ajude o aluno a estudar para a prova usando o material real do curso como fonte. ` +
        `Baseie-se apenas no material fornecido; se algo não estiver nele, diga que não há essa informação. ` +
        `Seja direto e organizado (títulos curtos e listas), priorize o que é mais provável de cair ` +
        `e responda em português (pt-BR), em markdown simples.`,
    },
    {
      role: "user",
      content: `Material do curso:\n${ctx.text}\n\nPergunta do aluno: ${question}`,
    },
  ];

  const stream = await client().chat.completions.create({
    model: config.models.training,
    temperature: config.temperature,
    max_tokens: config.max_output_tokens ?? 2200,
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
      model: config.models.training,
      prompt: serializePrompt(messages),
      promptHash: promptHash(messages),
      tokensIn,
      tokensOut,
    },
  };
}

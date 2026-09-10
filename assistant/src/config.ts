import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { assist } from "./paths.js";
import type {
  AiConfig,
  AiProfile,
  AiRequest,
  AnswerEntry,
  AnswerRecord,
  AnswerSource,
  Answers,
  Overrides,
  QuizSelection,
  Submissions,
} from "./types.js";

/**
 * The style rules the student edits on the activity screen ("Como escrever").
 * Kept separate from the activity scaffolding so the UI stays simple.
 */
export const DEFAULT_STYLE_TEMPLATE = `Instruções de escrita:
- Você é o aluno entregando a atividade. Escreva em primeira pessoa, como estudante.
- Nunca mencione que é uma IA e nunca use linguagem de assistente.
- Siga exatamente a estrutura da atividade: responda na mesma ordem e repita os títulos das seções exatamente como aparecem na atividade (ex: Parte 1, Parte 2, ...).
- Responda todas as partes e todas as questões, sem pular nenhuma. Só termine depois da última.
- Para cada questão, comece com o número dela.
- Nas questões de associação, escreva cada item com a resposta na mesma linha (ex: 1. item - resposta).
- Nas questões objetivas, responda só com a letra, sem justificar.
- Comece direto nas respostas, sem introdução nem despedida. Não ofereça ajuda extra.
- Escreva em português simples e natural, sem parecer robótico.
- Evite símbolos, emojis e negrito; pode usar os títulos das seções da própria atividade.`;

/**
 * The activity scaffolding: the fixed sections and {placeholders} the model
 * receives after the style rules. Edited only in "IA Ajustes".
 */
export const DEFAULT_ACTIVITY_TEMPLATE = `ATIVIDADE: {atividade}
TIPO: {tipo}
MÓDULO: {modulo}
PRAZO: {prazo}

=== ENUNCIADO / INSTRUÇÕES ===
{enunciado}

=== ARQUIVOS ANEXADOS ===
{arquivos}

=== QUESTÕES ===
{questoes}

=== OBSERVAÇÕES DO ALUNO ===
{observacoes}

=== PEDIDO ===
Responda a atividade inteira como o aluno, seguindo as regras de escrita acima. Entregue só as respostas, sem introdução nem despedida. Não mencione que é uma IA.`;

export const DEFAULT_AI_REQUEST: AiRequest = {
  perfil: "",
  instrucoes: [
    "responda como um aluno de faculdade",
    "escreva como um humano, em português simples",
    "evite símbolos e formatações",
    "não pareça com uma IA, não escreva de forma robótica",
  ],
  contexto: "",
  prompt: DEFAULT_STYLE_TEMPLATE,
};

export function defaultAiRequestJson(): string {
  return DEFAULT_STYLE_TEMPLATE;
}

const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.2,
  max_output_tokens: 4000,
  message_template: DEFAULT_STYLE_TEMPLATE,
  activity_template: DEFAULT_ACTIVITY_TEMPLATE,
  ai_templates: {},
};

export function openaiKey(): string {
  const k = process.env.OPENAI_API_KEY ?? "";
  if (!k || k === "sk-...") {
    throw new Error(
      "OPENAI_API_KEY não configurada. Crie assistant/.env a partir de .env.example e coloque sua chave.",
    );
  }
  return k;
}

export function loadAiConfig(): AiConfig {
  const file = assist("config", "ai-config.json");
  if (!existsSync(file)) return DEFAULT_AI_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as Partial<AiConfig>;
    let messageTemplate =
      raw.message_template ?? raw.ai_request_default ?? DEFAULT_AI_CONFIG.message_template;
    let activityTemplate = raw.activity_template ?? DEFAULT_AI_CONFIG.activity_template;
    // Migrate legacy configs where the whole message (style + scaffolding) lived
    // in message_template: split the activity sections out into activity_template.
    if (!raw.activity_template && messageTemplate.includes("{enunciado}")) {
      const idx = messageTemplate.search(/^ATIVIDADE:/m);
      if (idx >= 0) {
        activityTemplate = messageTemplate.slice(idx).trim();
        messageTemplate = messageTemplate.slice(0, idx).trim();
      }
    }
    return {
      ...DEFAULT_AI_CONFIG,
      ...raw,
      message_template: messageTemplate,
      activity_template: activityTemplate,
    };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAiConfig(cfg: AiConfig): void {
  mkdirSync(assist("config"), { recursive: true });
  writeFileSync(assist("config", "ai-config.json"), JSON.stringify(cfg, null, 2), "utf-8");
}

export function loadProfile(): AiProfile {
  const file = assist("config", "profile.json");
  if (!existsSync(file)) return { nome: "", matricula: "" };
  try {
    const p = JSON.parse(readFileSync(file, "utf-8")) as Partial<AiProfile>;
    return { nome: typeof p.nome === "string" ? p.nome : "", matricula: typeof p.matricula === "string" ? p.matricula : "" };
  } catch {
    return { nome: "", matricula: "" };
  }
}

export function saveProfile(profile: AiProfile): void {
  mkdirSync(assist("config"), { recursive: true });
  writeFileSync(assist("config", "profile.json"), JSON.stringify(profile, null, 2), "utf-8");
}

export function loadOverrides(): Overrides {
  const file = assist("config", "overrides.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Overrides;
  } catch {
    return {};
  }
}

export function loadAnswers(): Answers {
  const file = assist("data", "answers.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Answers;
  } catch {
    return {};
  }
}

export function saveAnswers(answers: Answers): void {
  mkdirSync(assist("data"), { recursive: true });
  writeFileSync(assist("data", "answers.json"), JSON.stringify(answers, null, 2), "utf-8");
}

const MAX_HISTORY = 20;

function normalizeAnswers(answers: Answers): Answers {
  const out: Answers = {};
  for (const [k, v] of Object.entries(answers)) {
    out[k] = {
      answer: v.answer,
      updatedAt: v.updatedAt,
      source: v.source,
      selections: Array.isArray(v.selections) ? v.selections : [],
      history: Array.isArray(v.history) ? v.history : [],
    };
  }
  return out;
}

export function getAnswerRecord(id: number | string): AnswerRecord | null {
  const rec = loadAnswers()[String(id)];
  return rec ? normalizeAnswers({ [String(id)]: rec })[String(id)] : null;
}

/**
 * Save a new version of an answer, keeping the previous current as the latest
 * history entry (deduped against the immediately preceding history item). Keeps
 * at most MAX_HISTORY versions.
 */
export function saveAnswerVersion(
  id: number | string,
  answer: string,
  source: AnswerSource,
  updatedAt: string = new Date().toISOString(),
  selections: QuizSelection[] = [],
): AnswerRecord {
  const key = String(id);
  const answers = normalizeAnswers(loadAnswers());
  const prev = answers[key];
  const history: AnswerEntry[] = [];
  if (prev) {
    const same =
      prev.answer === answer &&
      JSON.stringify(prev.selections ?? []) === JSON.stringify(selections);
    history.push(...prev.history);
    if (!same) {
      history.push({
        answer: prev.answer,
        updatedAt: prev.updatedAt,
        source: prev.source,
        selections: prev.selections ?? [],
      });
    }
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    if (same) {
      answers[key] = { ...prev, updatedAt, source, selections };
      saveAnswers(answers);
      return answers[key];
    }
  }
  const rec: AnswerRecord = { answer, updatedAt, source, selections, history };
  answers[key] = rec;
  saveAnswers(answers);
  return rec;
}

/** Restore a specific history entry (by index) as the current answer. */
export function restoreAnswerVersion(id: number | string, index: number): AnswerRecord {
  const rec = getAnswerRecord(id);
  if (!rec || index < 0 || index >= rec.history.length) {
    throw new Error(`histórico indisponível para ${id} (índice ${index})`);
  }
  const target = rec.history[index];
  const answers = normalizeAnswers(loadAnswers());
  const key = String(id);
  const history = [...rec.history];
  history.splice(index, 1);
  history.push({
    answer: rec.answer,
    updatedAt: rec.updatedAt,
    source: rec.source,
    selections: rec.selections ?? [],
  });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  const restored: AnswerRecord = {
    answer: target.answer,
    updatedAt: target.updatedAt,
    source: target.source,
    selections: target.selections ?? [],
    history,
  };
  answers[key] = restored;
  saveAnswers(answers);
  return restored;
}

/** Remove all history versions (keeps current). */
export function clearAnswerHistory(id: number | string): AnswerRecord {
  const answers = normalizeAnswers(loadAnswers());
  const key = String(id);
  const cur = answers[key];
  const rec: AnswerRecord = {
    answer: cur?.answer ?? "",
    updatedAt: cur?.updatedAt ?? new Date().toISOString(),
    source: cur?.source,
    selections: cur?.selections ?? [],
    history: [],
  };
  answers[key] = rec;
  saveAnswers(answers);
  return rec;
}

export function saveOverrides(overrides: Overrides): void {
  mkdirSync(assist("config"), { recursive: true });
  writeFileSync(assist("config", "overrides.json"), JSON.stringify(overrides, null, 2), "utf-8");
}

export function loadSubmissions(): Submissions {
  const file = assist("data", "submissions.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Submissions;
  } catch {
    return {};
  }
}

export function saveSubmissions(submissions: Submissions): void {
  mkdirSync(assist("data"), { recursive: true });
  writeFileSync(assist("data", "submissions.json"), JSON.stringify(submissions, null, 2), "utf-8");
}

export function saveAnswer(id: number | string, answer: string, source: "ai" | "manual"): void {
  saveAnswerVersion(id, answer, source);
}

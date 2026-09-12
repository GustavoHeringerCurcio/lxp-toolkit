/**
 * LEGACY JSON layer.
 *
 * Runtime state (answers, submissions, overrides, profile, AI config) is now
 * written to Postgres via `store.ts`. This module is kept for:
 *   1. the one-time import (`import.ts`) that reads pre-existing personal data, and
 *   2. the isolated unit tests of the old file format.
 * The `save*` helpers below are no longer called by the application.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { assist } from "./paths.js";
import type {
  AiActivitySections,
  AiConfig,
  AiProfile,
  AiStyle,
  AnswerEntry,
  AnswerRecord,
  AnswerSource,
  Answers,
  Overrides,
  QuizSelection,
  Submissions,
} from "./types.js";

/**
 * The writing rules sent as the `system` message. Structured so "IA Ajustes"
 * can edit each rule with a card/input instead of a free-text blob.
 */
export const DEFAULT_STYLE: AiStyle = {
  persona: "Você é o aluno entregando esta atividade.",
  voice:
    "Escreva em português simples e natural, como um estudante de faculdade — não como um assistente.",
  includeIdentity: true,
  mcqMode: "letter",
  numbering: true,
  associateInline: true,
  noIntroOutro: true,
  noMetaLabels: true,
  extraRules: "",
};

/** Which activity sections are sent as the `user` message. */
export const DEFAULT_ACTIVITY_SECTIONS: AiActivitySections = {
  enunciado: true,
  arquivos: true,
  questoes: true,
  observacoes: true,
};

const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
  max_output_tokens: 4000,
  style: { ...DEFAULT_STYLE },
  activitySections: { ...DEFAULT_ACTIVITY_SECTIONS },
};

export function openaiKey(): string {
  const k = process.env.OPENAI_API_KEY ?? "";
  if (!k || k === "sk-...") {
    throw new Error(
      "OPENAI_API_KEY não configurada. Crie apps/server/.env a partir de .env.example e coloque sua chave.",
    );
  }
  return k;
}

function freshDefaultConfig(): AiConfig {
  return {
    ...DEFAULT_AI_CONFIG,
    style: { ...DEFAULT_STYLE },
    activitySections: { ...DEFAULT_ACTIVITY_SECTIONS },
  };
}

export function loadAiConfig(): AiConfig {
  const file = assist("config", "ai-config.json");
  if (!existsSync(file)) return freshDefaultConfig();
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as Partial<AiConfig>;
    // Structured fields are merged over the defaults; legacy free-text fields
    // (`message_template` / `activity_template`) are intentionally ignored — the
    // old scaffolding is exactly what made the model echo section markers.
    return {
      ...DEFAULT_AI_CONFIG,
      ...raw,
      style: { ...DEFAULT_STYLE, ...(raw.style ?? {}) },
      activitySections: { ...DEFAULT_ACTIVITY_SECTIONS, ...(raw.activitySections ?? {}) },
    };
  } catch {
    return freshDefaultConfig();
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

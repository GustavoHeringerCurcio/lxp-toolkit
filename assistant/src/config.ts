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
  Submissions,
} from "./types.js";

export const DEFAULT_AI_REQUEST: AiRequest = {
  perfil: "",
  instrucoes: [
    "responda como um aluno de faculdade",
    "escreva como um humano, em português simples",
    "evite símbolos e formatações",
    "não pareça com uma i.a., não escreva de forma robótica",
  ],
  contexto: "",
};

export function defaultAiRequestJson(): string {
  return JSON.stringify(DEFAULT_AI_REQUEST, null, 2);
}

const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.7,
  language: "pt-BR",
  max_output_tokens: 2400,
  system_prompt: `Você é um assistente de estudos que ajuda um aluno universitário da disciplina "Programação Back-End" a elaborar respostas para atividades.

Instruções estruturais:
- Responda SEMPRE em português do Brasil ({language}).
- Para questionários (quiz): responda indicando claramente a alternativa correta por questão (ex.: "1) b) Disponibilidade.") e justifique em uma frase.
- Para tarefas com arquivo (upload): produza o texto da resposta pronto para ser salvo/enviado, seguindo o enunciado (pode incluir código, tabelas etc. conforme pedido).
- Considere o perfil do estudante e as regras de estilo fornecidas pelo usuário na mensagem.`,
  ai_request_default: defaultAiRequestJson(),
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
    return { ...DEFAULT_AI_CONFIG, ...(JSON.parse(readFileSync(file, "utf-8")) as Partial<AiConfig>) };
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
): AnswerRecord {
  const key = String(id);
  const answers = normalizeAnswers(loadAnswers());
  const prev = answers[key];
  const history: AnswerEntry[] = [];
  if (prev) {
    const same = prev.answer === answer;
    history.push(...prev.history);
    if (!same) history.push({ answer: prev.answer, updatedAt: prev.updatedAt, source: prev.source });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    if (same && prev.answer === answer) {
      answers[key] = { ...prev, updatedAt, source };
      saveAnswers(answers);
      return answers[key];
    }
  }
  const rec: AnswerRecord = { answer, updatedAt, source, history };
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
  history.push({ answer: rec.answer, updatedAt: rec.updatedAt, source: rec.source });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  const restored: AnswerRecord = {
    answer: target.answer,
    updatedAt: target.updatedAt,
    source: target.source,
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

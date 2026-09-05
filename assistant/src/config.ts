import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { assist } from "./paths.js";
import type { AiConfig, Answers, Overrides } from "./types.js";

const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.7,
  language: "pt-BR",
  system_prompt: `Você é um assistente de estudos que ajuda um aluno universitário a elaborar respostas para as atividades da disciplina "Programação Back-End".

Regras:
- Responda SEMPRE em português do Brasil ({language}).
- Escreva de forma natural, como se fosse o próprio aluno redigindo, sem menções a "IA" ou "assistente".
- Seja objetivo mas completo; fundamente quando fizer sentido.
- Para questionários (quiz), responda indicando claramente a alternativa correta por questão (ex.: "1) b) Disponibilidade.") e justifique em uma frase.
- Para tarefas com arquivo (upload), produza o texto da resposta pronto para ser salvo/enviado, seguindo o enunciado (pode incluir código, tabelas etc. conforme pedido).`,
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

export function saveOverrides(overrides: Overrides): void {
  mkdirSync(assist("config"), { recursive: true });
  writeFileSync(assist("config", "overrides.json"), JSON.stringify(overrides, null, 2), "utf-8");
}

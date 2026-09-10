import type { AiProfile, AiRequest } from "./types.js";
import { DEFAULT_AI_REQUEST } from "./config.js";

/** Replace supported {placeholders} in free text. */
export function resolvePlaceholders(text: string, profile: AiProfile): string {
  return text
    .replaceAll("{nome}", profile.nome || "")
    .replaceAll("{matricula}", profile.matricula || "")
    .trim();
}

export function isPlaceholder(value: string): boolean {
  return value.includes("{");
}

/** Validate/parse a user-edited JSON string into an AiRequest (never throws). */
export function parseAiRequest(raw: string): AiRequest {
  if (!raw || !raw.trim()) return { ...DEFAULT_AI_REQUEST, contexto: "", perfil: "" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON inválido — revise o conteúdo antes de salvar.");
  }
  if (Array.isArray(parsed)) throw new Error("O JSON deve ser um objeto, não um array.");
  if (typeof parsed !== "object" || parsed === null) throw new Error("O JSON deve ser um objeto.");
  const o = parsed as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v) : "");
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((i) => str(i)).filter(Boolean) : []);
  const instrucoes = arr(o.instrucoes);
  return {
    perfil: str(o.perfil),
    instrucoes: instrucoes.length ? instrucoes : [...DEFAULT_AI_REQUEST.instrucoes],
    contexto: str(o.contexto),
  };
}

/**
 * Render an AiRequest into the human-readable "aluno" block that is prepended
 * to the exercise content in the user message. Placeholders are resolved.
 */
export function renderRequestBlock(req: AiRequest, profile: AiProfile): string {
  const lines: string[] = [];
  const perfil = resolvePlaceholders(req.perfil, profile);
  if (perfil) lines.push(`Quem sou: ${perfil}`);
  if (req.instrucoes.length) {
    lines.push("Como escrever:");
    for (const ins of req.instrucoes) lines.push(`- ${resolvePlaceholders(ins, profile)}`);
  }
  const contexto = resolvePlaceholders(req.contexto, profile);
  if (contexto) lines.push(`Contexto extra:\n${contexto}`);
  return lines.join("\n");
}

/**
 * Compact preview of what the model will receive, without the heavy file/PDF
 * contents — used to show "o que a IA vai receber" in the UI.
 */
export function renderPromptPreview(
  kind: "upload" | "quiz",
  title: string,
  moduleLabel: string,
  hasInstructions: boolean,
  hasFiles: number,
  questionCount: number,
  req: AiRequest,
  profile: AiProfile,
): string {
  const out: string[] = [];
  const block = renderRequestBlock(req, profile);
  if (block) out.push(block);
  out.push("");
  out.push(`ATIVIDADE: ${title}`);
  out.push(`TIPO: ${kind === "upload" ? "tarefa com envio de arquivo" : "questionário/quiz"}`);
  out.push(`MÓDULO: ${moduleLabel}`);
  if (hasInstructions) out.push("ENUNCIADO: (texto da atividade)");
  if (kind === "upload" && hasFiles) out.push(`ARQUIVOS ANEXADOS: ${hasFiles} arquivo(s) — texto extraído de cada PDF`);
  if (kind === "quiz" && questionCount) out.push(`QUESTÕES: ${questionCount} questão(ões) com alternativas`);
  out.push("");
  out.push('SOLICITAÇÃO: Elabore a resposta seguindo o "Como escrever" acima.');
  return out.join("\n");
}

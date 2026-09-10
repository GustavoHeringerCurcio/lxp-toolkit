import type { AiProfile, AiRequest } from "@/types";

export function resolvePlaceholders(text: string, profile: AiProfile): string {
  return text
    .replaceAll("{nome}", profile.nome || "")
    .replaceAll("{matricula}", profile.matricula || "")
    .trim();
}

const FALLBACK_INSTRUCOES = [
  "responda como um aluno de faculdade",
  "escreva como um humano, em português simples",
  "evite símbolos e formatações",
  "não pareça com uma i.a., não escreva de forma robótica",
];

/**
 * Parse a stored AiRequest for the editor. Accepts legacy JSON or a plain-text
 * prompt; plain text is wrapped in `prompt`. Returns null only when empty.
 */
export function tryParseAiRequest(raw: string): AiRequest | null {
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { perfil: "", instrucoes: [], contexto: "", prompt: raw.trim() };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { perfil: "", instrucoes: [], contexto: "", prompt: raw.trim() };
  }
  const o = parsed as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v) : "");
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((i) => str(i)).filter(Boolean) : []);
  const instrucoes = arr(o.instrucoes);
  const prompt = str(o.prompt).trim();
  return {
    perfil: str(o.perfil),
    instrucoes: instrucoes.length ? instrucoes : [...FALLBACK_INSTRUCOES],
    contexto: str(o.contexto),
    ...(prompt ? { prompt } : {}),
  };
}

/**
 * Render an AiRequest into the editable, human-friendly text shown in the UI.
 * Placeholders are intentionally left unresolved so `{nome}`/`{matricula}`
 * stay visible and keep working.
 */
export function aiRequestToText(req: AiRequest): string {
  if (req.prompt?.trim()) return req.prompt;
  const lines: string[] = [];
  if (req.perfil.trim()) lines.push(`Quem sou: ${req.perfil.trim()}`);
  if (req.instrucoes.length) {
    lines.push("Como escrever:");
    for (const ins of req.instrucoes) lines.push(`- ${ins}`);
  }
  if (req.contexto.trim()) lines.push(`Contexto extra:\n${req.contexto.trim()}`);
  return lines.join("\n");
}

/** Convert any stored raw AiRequest (JSON or plain text) into editable text. */
export function rawToEditableText(raw: string): string {
  const parsed = tryParseAiRequest(raw);
  return parsed ? aiRequestToText(parsed) : "";
}

/** Wrap free-form editor text into an AiRequest for previews. */
export function textToAiRequest(text: string): AiRequest {
  return { perfil: "", instrucoes: [], contexto: "", prompt: text };
}

/** Render the AiRequest "aluno" block exactly like the server does. */
export function renderRequestBlock(req: AiRequest, profile: AiProfile): string {
  if (req.prompt?.trim()) return resolvePlaceholders(req.prompt, profile);
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

/** Full preview (no PDF bodies) of what the model sees for a given exercise. */
export function renderPromptPreview(opts: {
  kind: "upload" | "quiz";
  title: string;
  moduleLabel: string;
  hasInstructions: boolean;
  fileCount: number;
  questionCount: number;
  req: AiRequest;
  profile: AiProfile;
}): string {
  const { kind, title, moduleLabel, hasInstructions, fileCount, questionCount, req, profile } = opts;
  const out: string[] = [];
  const block = renderRequestBlock(req, profile);
  if (block) out.push(block);
  out.push("");
  out.push(`ATIVIDADE: ${title}`);
  out.push(`TIPO: ${kind === "upload" ? "tarefa com envio de arquivo" : "questionário/quiz"}`);
  out.push(`MÓDULO: ${moduleLabel}`);
  if (hasInstructions) out.push("ENUNCIADO: (texto da atividade)");
  if (kind === "upload" && fileCount) out.push(`ARQUIVOS ANEXADOS: ${fileCount} arquivo(s) — texto extraído de cada PDF`);
  if (kind === "quiz" && questionCount) out.push(`QUESTÕES: ${questionCount} questão(ões) com alternativas`);
  out.push("");
  out.push('SOLICITAÇÃO: Elabore a resposta seguindo o "Como escrever" acima.');
  return out.join("\n");
}

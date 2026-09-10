import type { AiProfile, AiRequest, Exercise } from "./types.js";
import { DEFAULT_AI_REQUEST } from "./config.js";
import { extractFileText } from "./pdf.js";

export function isPlaceholder(value: string): boolean {
  return value.includes("{");
}

/**
 * Every value that can be injected into the message template. These are the
 * only things the user does not type by hand; everything else is editable.
 */
export interface PromptVars {
  nome: string;
  matricula: string;
  atividade: string;
  tipo: string;
  modulo: string;
  prazo: string;
  enunciado: string;
  arquivos: string;
  questoes: string;
  observacoes: string;
}

/** Replace every supported {placeholder} in the message template. */
export function renderTemplate(text: string, vars: PromptVars): string {
  return text
    .replaceAll("{nome}", vars.nome)
    .replaceAll("{matricula}", vars.matricula)
    .replaceAll("{atividade}", vars.atividade)
    .replaceAll("{tipo}", vars.tipo)
    .replaceAll("{modulo}", vars.modulo)
    .replaceAll("{prazo}", vars.prazo)
    .replaceAll("{enunciado}", vars.enunciado)
    .replaceAll("{arquivos}", vars.arquivos)
    .replaceAll("{questoes}", vars.questoes)
    .replaceAll("{observacoes}", vars.observacoes)
    .trim();
}

/**
 * Parse a stored AiRequest. Accepts either the legacy/default JSON object or a
 * plain-text prompt. A JSON string that is not an object (or is invalid) is
 * treated as free-form prompt text. Never throws.
 */
export function parseAiRequest(raw: string): AiRequest {
  if (!raw || !raw.trim()) return { ...DEFAULT_AI_REQUEST, contexto: "", perfil: "" };
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
    instrucoes: instrucoes.length ? instrucoes : [...DEFAULT_AI_REQUEST.instrucoes],
    contexto: str(o.contexto),
    ...(prompt ? { prompt } : {}),
  };
}

/**
 * Render the legacy structured AiRequest (perfil/instrucoes/contexto) into the
 * base message. A free-form `prompt` is returned as-is; its content placeholders
 * are resolved later by renderTemplate.
 */
export function renderRequestBlock(req: AiRequest, profile: AiProfile): string {
  if (req.prompt?.trim()) return req.prompt;
  const lines: string[] = [];
  if (profile.nome) lines.push(`Quem sou: ${profile.nome}`);
  if (req.instrucoes.length) {
    lines.push("Como escrever:");
    for (const ins of req.instrucoes) lines.push(`- ${ins}`);
  }
  if (req.contexto.trim()) lines.push(`Contexto extra:\n${req.contexto}`);
  return lines.join("\n");
}

/** Build the placeholder values for one exercise (extracts PDF text on the server). */
export async function buildPromptVars(e: Exercise, profile: AiProfile, notes = ""): Promise<PromptVars> {
  const tipo = e.kind === "upload" ? "tarefa com envio de arquivo" : "questionário/quiz";
  const modulo = e.moduleTitle + (e.sectionTitle ? ` — ${e.sectionTitle}` : "");

  let arquivos = "";
  if (e.kind === "upload") {
    const chunks: string[] = [];
    for (const f of e.files) {
      chunks.push(`--- Arquivo: ${f.name} ---`);
      const text = await extractFileText(f.absPath);
      if (text) {
        const max = 30_000;
        chunks.push(text.length > max ? text.slice(0, max) + "\n…[truncado]" : text);
      } else {
        chunks.push("(Arquivo sem texto extraível — provavelmente imagem/escaneado ou conversão indisponível; veja o arquivo).");
      }
    }
    if (e.remoteFiles.length) {
      chunks.push(`Links dos arquivos no portal:\n${e.remoteFiles.map((r) => `- ${r.filename ?? r.url} (${r.url})`).join("\n")}`);
    }
    arquivos = chunks.join("\n");
  }

  let questoes = "";
  if (e.kind === "quiz" && e.questions.length) {
    const lines: string[] = [];
    for (const q of e.questions) {
      lines.push(`Q${q.id}: ${q.text}`);
      q.options.forEach((opt, i) => lines.push(`   ${String.fromCharCode(97 + i)}) ${opt}`));
    }
    questoes = lines.join("\n");
  }

  return {
    nome: profile.nome ?? "",
    matricula: profile.matricula ?? "",
    atividade: e.title,
    tipo,
    modulo,
    prazo: e.deadlineAt ?? "",
    enunciado: e.instructionsText ?? "",
    arquivos,
    questoes,
    observacoes: notes,
  };
}

export interface ChatMessage {
  role: "user";
  content: string;
}

/**
 * Build the exact messages sent to the model. The stored request is the message
 * template; the activity content is substituted into its placeholders. There is
 * no system message and nothing else is injected.
 */
export async function buildMessages(
  e: Exercise,
  requestRaw: string,
  profile: AiProfile,
  notes = "",
): Promise<ChatMessage[]> {
  const req = parseAiRequest(requestRaw);
  const template = renderRequestBlock(req, profile);
  const vars = await buildPromptVars(e, profile, notes);
  return [{ role: "user", content: renderTemplate(template, vars) }];
}

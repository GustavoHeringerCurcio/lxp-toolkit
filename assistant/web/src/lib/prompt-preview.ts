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

/** Parse a raw AiRequest JSON for the editor; returns null when invalid. */
export function tryParseAiRequest(raw: string): AiRequest | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || Array.isArray(parsed)) return null;
    const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v) : "");
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((i) => str(i)).filter(Boolean) : []);
    const instrucoes = arr(parsed.instrucoes);
    return {
      perfil: str(parsed.perfil),
      instrucoes: instrucoes.length ? instrucoes : [...FALLBACK_INSTRUCOES],
      contexto: str(parsed.contexto),
    };
  } catch {
    return null;
  }
}

/** Render the AiRequest "aluno" block exactly like the server does. */
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

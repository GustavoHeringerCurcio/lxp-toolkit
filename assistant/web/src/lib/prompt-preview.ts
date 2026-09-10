import type { AiProfile, Exercise } from "@/types";

/**
 * Default message sent to the model. Must match `DEFAULT_MESSAGE_TEMPLATE` in
 * assistant/src/config.ts so the preview and the real request stay in sync.
 */
export const DEFAULT_MESSAGE_TEMPLATE = `Como escrever:
- responda como um aluno de faculdade
- escreva como um humano, em português simples
- evite símbolos e formatações
- não pareça com uma IA, não escreva de forma robótica

ATIVIDADE: {atividade}
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
Escreva a resposta desta atividade seguindo as regras de "Como escrever" acima. Escreva como o aluno, sem mencionar que você é uma IA.`;

export const PLACEHOLDERS = [
  "{nome}",
  "{matricula}",
  "{atividade}",
  "{tipo}",
  "{modulo}",
  "{prazo}",
  "{enunciado}",
  "{arquivos}",
  "{questoes}",
  "{observacoes}",
] as const;

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

/** Placeholder values for one exercise. PDF bodies are only known server-side. */
export function buildVars(e: Exercise, profile: AiProfile, notes = ""): PromptVars {
  const tipo = e.kind === "upload" ? "tarefa com envio de arquivo" : "questionário/quiz";
  const modulo = e.moduleTitle + (e.sectionTitle ? ` — ${e.sectionTitle}` : "");

  let arquivos = "";
  if (e.kind === "upload") {
    const chunks = e.files.map(
      (f) => `--- Arquivo: ${f.name} ---\n(texto do PDF é extraído no momento do envio)`,
    );
    if (e.remoteFiles.length) {
      chunks.push(
        `Links dos arquivos no portal:\n${e.remoteFiles.map((r) => `- ${r.filename ?? r.url} (${r.url})`).join("\n")}`,
      );
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

/** The exact message the model will receive for this exercise (PDF bodies omitted). */
export function renderPreviewMessage(template: string, e: Exercise, profile: AiProfile): string {
  return renderTemplate(template, buildVars(e, profile));
}

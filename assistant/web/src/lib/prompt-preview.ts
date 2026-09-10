import type { AiProfile, Exercise } from "@/types";

/**
 * Default style rules ("Como escrever"). Must match `DEFAULT_STYLE_TEMPLATE` in
 * assistant/src/config.ts so the preview and the real request stay in sync.
 */
export const DEFAULT_STYLE_TEMPLATE = `Como escrever:
- responda como um aluno de faculdade
- escreva como um humano, em português simples
- evite símbolos e formatações
- não pareça com uma IA, não escreva de forma robótica`;

/**
 * Default activity scaffolding. Must match `DEFAULT_ACTIVITY_TEMPLATE` in
 * assistant/src/config.ts so the preview and the real request stay in sync.
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
Escreva a resposta desta atividade seguindo as regras de "Como escrever" acima. Escreva como o aluno, sem mencionar que você é uma IA.`;

/** Identity header placed at the top of every message, built from the profile. */
export function buildIdentityHeader(profile: AiProfile): string {
  const lines: string[] = [];
  if (profile.nome?.trim()) lines.push(`Nome: ${profile.nome.trim()}`);
  if (profile.matricula?.trim()) lines.push(`Matrícula: ${profile.matricula.trim()}`);
  return lines.join("\n");
}

/** Join the identity header, style rules and activity scaffolding into one message. */
export function composeMessage(style: string, activityTemplate: string, profile: AiProfile): string {
  const header = buildIdentityHeader(profile).trim();
  const s = style.trim();
  const a = activityTemplate.trim();
  return [header, s, a].filter(Boolean).join("\n\n");
}

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
export function renderPreviewMessage(
  style: string,
  activityTemplate: string,
  e: Exercise,
  profile: AiProfile,
): string {
  return renderTemplate(composeMessage(style, activityTemplate, profile), buildVars(e, profile));
}

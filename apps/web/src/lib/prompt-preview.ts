import type { AiActivitySections, AiProfile, AiStyle, Exercise, ForumPost } from "@/types";
import { KIND_META } from "@/lib/kind";
import { stripHtml } from "@/lib/utils";

/**
 * Default writing rules. Must match `DEFAULT_STYLE` in `apps/server/src/config.ts`
 * so the preview and the real request stay in sync.
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
  /** Forum thread (question + existing posts); empty for non-forum items. */
  forum: string;
}

/** Replace every supported {placeholder} in the given text. */
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
    .replaceAll("{forum}", vars.forum)
    .trim();
}

/** Compile the structured style into the `system` message. */
export function buildStylePrompt(style: AiStyle, extraInstructions = ""): string {
  const parts: string[] = [];
  if (style.persona.trim()) parts.push(style.persona.trim());
  if (style.voice.trim()) parts.push(style.voice.trim());

  const format: string[] = [];
  if (style.includeIdentity)
    format.push('- Comece a resposta com duas linhas: "Nome: {nome}" e "Matrícula: {matricula}".');
  if (style.numbering)
    format.push("- Numere cada resposta com o número da questão, na ordem em que aparecem.");
  if (style.mcqMode === "letter")
    format.push("- Questões de múltipla escolha: escreva só a letra da alternativa (exemplo: 2. A).");
  else
    format.push(
      "- Questões de múltipla escolha: escreva a letra da alternativa e uma breve justificativa.",
    );
  if (style.associateInline)
    format.push(
      "- Questões de associação: escreva cada item com a resposta na mesma linha (exemplo: 1. item - resposta).",
    );
  if (format.length) parts.push(`Formato da resposta:\n${format.join("\n")}`);

  const rules: string[] = ["- Nunca diga que é uma IA e nunca use linguagem de assistente."];
  if (style.noMetaLabels)
    rules.push(
      "- Não repita os rótulos de contexto da atividade (Atividade, Tipo, Módulo, Enunciado, Arquivos, Questões, Observações).",
    );
  if (style.noIntroOutro) rules.push("- Sem introdução, sem despedida e sem oferecer ajuda extra.");
  rules.push("- Escreva em texto simples, sem símbolos, emojis ou negrito.");
  for (const raw of style.extraRules.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    rules.push(line.startsWith("-") ? line : `- ${line}`);
  }
  parts.push(`Regras:\n${rules.join("\n")}`);

  if (extraInstructions.trim()) {
    parts.push(`Instruções específicas desta atividade:\n${extraInstructions.trim()}`);
  }
  return parts.join("\n\n");
}

/**
 * Compile the activity content into the `user` message (plain labels only).
 * Empty sections are skipped so the model never sees a dangling "Questões:".
 */
export function buildActivityPrompt(vars: PromptVars, sections: AiActivitySections): string {
  const blocks: string[] = [
    `Atividade: ${vars.atividade}`,
    `Tipo: ${vars.tipo}`,
    `Módulo: ${vars.modulo}`,
  ];
  if (sections.enunciado && vars.enunciado.trim()) blocks.push(`Enunciado:\n${vars.enunciado.trim()}`);
  if (vars.forum.trim()) blocks.push(`Publicações no fórum:\n${vars.forum.trim()}`);
  if (sections.arquivos && vars.arquivos.trim())
    blocks.push(`Arquivos anexados:\n${vars.arquivos.trim()}`);
  if (sections.questoes && vars.questoes.trim()) blocks.push(`Questões:\n${vars.questoes.trim()}`);
  if (sections.observacoes && vars.observacoes.trim())
    blocks.push(`Observações do aluno:\n${vars.observacoes.trim()}`);
  return blocks.join("\n\n");
}

/** Placeholder values for one exercise. PDF bodies are only known server-side. */
export function buildVars(
  e: Exercise,
  profile: AiProfile,
  notes = "",
  sections: AiActivitySections = DEFAULT_ACTIVITY_SECTIONS,
): PromptVars {
  const tipo =
    e.kind === "upload"
      ? "tarefa com envio de arquivo"
      : e.kind === "quiz"
        ? "questionário/quiz"
        : e.kind === "forum"
          ? "publicação em fórum de discussão"
          : KIND_META[e.kind].label;
  const modulo = e.moduleTitle + (e.sectionTitle ? ` — ${e.sectionTitle}` : "");

  let arquivos = "";
  if (e.kind === "upload" && sections.arquivos) {
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
  if (e.kind === "quiz" && e.questions.length && sections.questoes) {
    const lines: string[] = [];
    for (const q of e.questions) {
      lines.push(`Q${q.id}: ${q.text}`);
      q.options.forEach((opt, i) => lines.push(`   ${String.fromCharCode(97 + i)}) ${opt.text}`));
    }
    questoes = lines.join("\n");
  }

  let forum = "";
  if (e.kind === "forum" && e.forum) {
    const lines: string[] = [];
    const renderPost = (depth: number, p: ForumPost): void => {
      if (p.isDeleted) return;
      const indent = "  ".repeat(depth);
      const who =
        p.postOwnerSafeaRole && p.postOwnerSafeaRole !== "student"
          ? `${p.postOwnerUsername} (${p.postOwnerRoleName ?? p.postOwnerSafeaRole})`
          : p.postOwnerUsername;
      lines.push(`${indent}- ${who} em ${p.createdAt}:`);
      lines.push(`${indent}  ${stripHtml(p.html)}`);
      for (const c of p.children) renderPost(depth + 1, c);
    };
    for (const p of e.forum.posts) renderPost(0, p);
    forum = lines.join("\n");
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
    forum,
    observacoes: notes,
  };
}

/**
 * The exact messages the model will receive for this exercise, split by role
 * (PDF bodies omitted). This mirrors `buildMessages` in `apps/server/src/prompt.ts`.
 */
export function renderPreviewMessage(
  style: AiStyle,
  sections: AiActivitySections,
  e: Exercise,
  profile: AiProfile,
  extraInstructions = "",
): string {
  const vars = buildVars(e, profile, "", sections);
  const system = renderTemplate(buildStylePrompt(style, extraInstructions), vars).trim();
  let user = buildActivityPrompt(vars, sections).trim();
  if (e.kind === "quiz" && e.questions.length) {
    user +=
      `\n\nFormato da resposta: uma linha por questão, no formato "Q<id>: <letra>", sem texto extra.` +
      ` Exemplo: Q${e.questions[0].id}: B`;
  }
  if (e.kind === "forum") {
    user +=
      `\n\nFormato da resposta: uma única publicação em primeira pessoa, pronta para colar no fórum.` +
      ` Responda à pergunta do professor com naturalidade (linguagem simples, como um aluno escrevendo para a turma),` +
      ` sem saudações longas, sem repetir o enunciado e sem se dirigir a colegas específicos.` +
      ` Se já houver publicações parecidas, complemente o que falta em vez de repetir.`;
  }
  const parts: string[] = [];
  if (system) parts.push(`[system]\n${system}`);
  if (user) parts.push(`[user]\n${user}`);
  return parts.join("\n\n");
}

/** Render just the system rules (used for the live preview on IA Ajustes). */
export function renderStylePreview(style: AiStyle): string {
  return buildStylePrompt(style);
}

/**
 * Turn a stored per-exercise override into plain extra instructions. Handles
 * both the new free-text format and legacy JSON. Mirrors the server helper.
 */
export function resolveExtraInstructions(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.trim();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return raw.trim();
  const o = parsed as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  if (str(o.prompt).trim()) return str(o.prompt).trim();
  const lines: string[] = [];
  if (Array.isArray(o.instrucoes)) {
    for (const ins of o.instrucoes) if (str(ins).trim()) lines.push(`- ${str(ins).trim()}`);
  }
  if (str(o.contexto).trim()) lines.push(str(o.contexto).trim());
  return lines.join("\n").trim();
}

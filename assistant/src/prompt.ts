import type { AiActivitySections, AiProfile, AiStyle, Exercise, QuizQ, QuizSelection } from "./types.js";
import { DEFAULT_ACTIVITY_SECTIONS } from "./config.js";
import { kindLabel } from "./kind.js";
import { extractFileText } from "./pdf.js";

export function isPlaceholder(value: string): boolean {
  return value.includes("{");
}

/**
 * Every value that can be injected into the compiled messages. These are the
 * only things the user does not type by hand; everything else is structured
 * config or fixed code.
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
    .trim();
}

/**
 * Parse a stored per-exercise override. Accepts either a legacy JSON object or
 * plain text. Never throws.
 */
export function parseAiRequest(raw: string): {
  perfil: string;
  instrucoes: string[];
  contexto: string;
  prompt?: string;
} {
  if (!raw || !raw.trim()) return { perfil: "", instrucoes: [], contexto: "" };
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
  const str = (v: unknown): string =>
    typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v) : "";
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((i) => str(i)).filter(Boolean) : [];
  const prompt = str(o.prompt).trim();
  return {
    perfil: str(o.perfil),
    instrucoes: arr(o.instrucoes),
    contexto: str(o.contexto),
    ...(prompt ? { prompt } : {}),
  };
}

/**
 * Turn a stored per-exercise override into plain extra instructions. Handles
 * both the new free-text format and legacy JSON (prompt / instrucoes / contexto).
 */
export function resolveExtraInstructions(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const req = parseAiRequest(raw);
  if (req.prompt?.trim()) return req.prompt.trim();
  const lines: string[] = [];
  for (const ins of req.instrucoes) lines.push(`- ${ins}`);
  if (req.contexto.trim()) lines.push(req.contexto.trim());
  return lines.join("\n").trim();
}

/**
 * Compile the structured style into the `system` message. This is what tells
 * the model *how* to answer; the activity content comes separately as the
 * `user` message, so the model never has a reason to echo the scaffolding.
 */
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
  if (sections.arquivos && vars.arquivos.trim())
    blocks.push(`Arquivos anexados:\n${vars.arquivos.trim()}`);
  if (sections.questoes && vars.questoes.trim()) blocks.push(`Questões:\n${vars.questoes.trim()}`);
  if (sections.observacoes && vars.observacoes.trim())
    blocks.push(`Observações do aluno:\n${vars.observacoes.trim()}`);
  return blocks.join("\n\n");
}

/** Build the placeholder values for one exercise (extracts PDF text on the server). */
export async function buildPromptVars(
  e: Exercise,
  profile: AiProfile,
  notes = "",
  sections: AiActivitySections = DEFAULT_ACTIVITY_SECTIONS,
): Promise<PromptVars> {
  const tipo =
    e.kind === "upload"
      ? "tarefa com envio de arquivo"
      : e.kind === "quiz"
        ? "questionário/quiz"
        : kindLabel(e.kind);
  const modulo = e.moduleTitle + (e.sectionTitle ? ` — ${e.sectionTitle}` : "");

  let arquivos = "";
  if (e.kind === "upload" && sections.arquivos) {
    const chunks: string[] = [];
    for (const f of e.files) {
      chunks.push(`--- Arquivo: ${f.name} ---`);
      const text = await extractFileText(f.absPath);
      if (text) {
        const max = 30_000;
        chunks.push(text.length > max ? text.slice(0, max) + "\n…[truncado]" : text);
      } else {
        chunks.push(
          "(Arquivo sem texto extraível — provavelmente imagem/escaneado ou conversão indisponível; veja o arquivo).",
        );
      }
    }
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
  role: "system" | "user";
  content: string;
}

/**
 * Build the exact messages sent to the model: a `system` message with the
 * structured style rules (plus per-exercise extra instructions) and a `user`
 * message with the activity content. No scaffolding markers are ever sent, so
 * the model has nothing to echo back.
 */
export async function buildMessages(
  e: Exercise,
  profile: AiProfile,
  style: AiStyle,
  sections: AiActivitySections,
  extraInstructions = "",
  notes = "",
): Promise<ChatMessage[]> {
  const vars = await buildPromptVars(e, profile, notes, sections);
  const messages: ChatMessage[] = [];

  const system = renderTemplate(buildStylePrompt(style, extraInstructions), vars).trim();
  if (system) messages.push({ role: "system", content: system });

  let user = buildActivityPrompt(vars, sections).trim();
  if (e.kind === "quiz" && e.questions.length) {
    user +=
      `\n\nFormato da resposta: uma linha por questão, no formato "Q<id>: <letra>", sem texto extra.` +
      ` Exemplo: Q${e.questions[0].id}: B`;
  }
  if (user) messages.push({ role: "user", content: user });

  return messages;
}

/**
 * Extract quiz selections from a generated answer. Primary format is
 * `Q<id>: <letra>`; if no id matches, falls back to ordered `1. B` lines mapped
 * to the questions in order.
 */
export function parseQuizSelections(text: string, questions: QuizQ[]): QuizSelection[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const found = new Map<number, number>();

  const idRe = /Q\s*(\d+)\s*[:=\-.)\]]*\s*\(?([a-jA-J])\)?/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(text)) !== null) {
    const id = Number(m[1]);
    const q = byId.get(id);
    if (!q) continue;
    const idx = m[2].toLowerCase().charCodeAt(0) - 97;
    if (idx >= 0 && idx < q.options.length) found.set(id, idx);
  }

  if (found.size === 0) {
    const lineRe = /^\s*\d+\s*[.):\-]\s*\(?([a-jA-J])\)?/gm;
    let lm: RegExpExecArray | null;
    let order = 0;
    while ((lm = lineRe.exec(text)) !== null && order < questions.length) {
      const q = questions[order];
      const idx = lm[1].toLowerCase().charCodeAt(0) - 97;
      if (idx >= 0 && idx < q.options.length) {
        found.set(q.id, idx);
        order++;
      }
    }
  }

  return questions
    .filter((q) => found.has(q.id))
    .map((q) => {
      const optionIndex = found.get(q.id) as number;
      return { questionId: q.id, optionIndex, letter: String.fromCharCode(97 + optionIndex) };
    });
}

/**
 * Rewrite the machine-readable `Q<id>: <letra>` lines the model is forced to
 * produce into human-facing `N. <letra>` lines, numbered by question order.
 * Only for display/save/export — parsing must always run on the raw text first.
 * Unknown ids and everything else are left untouched.
 */
export function humanizeQuizAnswer(text: string, questions: QuizQ[]): string {
  if (!text || !questions.length) return text;
  const orderById = new Map(questions.map((q, i) => [q.id, i + 1]));
  const idRe = /Q\s*(\d+)\s*[:=\-.)\]]*\s*\(?([a-jA-J])\)?/g;
  return text.replace(idRe, (match, rawId: string, rawLetter: string) => {
    const n = orderById.get(Number(rawId));
    return n ? `${n}. ${rawLetter.toUpperCase()}` : match;
  });
}

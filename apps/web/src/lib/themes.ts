import { resolveExtraInstructions } from "@/lib/prompt-preview";

/**
 * Project themes suggested for the back-end course project (see the portal's
 * "Definição da área" item). Used by the project-context dropdown; the list is
 * language-neutral and stays in Portuguese to match the course material.
 */
export const PROJECT_THEMES = [
  "Blog Dinâmico",
  "Loja Virtual",
  "Gerenciador de Tarefas",
  "API Climática",
  "Agenda de Contatos",
] as const;

export type ProjectTheme = (typeof PROJECT_THEMES)[number];

/** Compose the per-exercise instruction block persisted as the AI request. */
export function composeContextInstructions(input: {
  theme: string;
  atores: string[];
  requisitos: string[];
}): string {
  const lines: string[] = [];
  const theme = input.theme.trim();
  if (theme) lines.push(`Contexto do projeto: ${theme}.`);
  if (input.atores.length) lines.push(`Atores: ${input.atores.join(", ")}.`);
  if (input.requisitos.length) {
    lines.push("Requisitos funcionais relevantes:");
    for (const r of input.requisitos) lines.push(`- ${r}`);
  }
  if (lines.length) {
    lines.push("Use este contexto para preencher a atividade, sem mencionar que ele foi fornecido.");
  }
  return lines.join("\n");
}

export interface ParsedContextInstructions {
  theme: string;
  atores: string[];
  requisitos: string[];
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Reverse of {@link composeContextInstructions}: recover the structured theme,
 * actors and requirements from a saved AI request so the panel can be prefilled
 * when reopened. Returns `null` when the stored text isn't a project context
 * (e.g. a free-form AI request), leaving the fields untouched.
 */
export function parseContextInstructions(
  raw: string | null | undefined,
): ParsedContextInstructions | null {
  const text = resolveExtraInstructions(raw);
  if (!text) return null;

  let theme = "";
  let atores: string[] = [];
  const requisitos: string[] = [];
  let inRequisitos = false;
  let matched = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const themeMatch = trimmed.match(/^Contexto do projeto:\s*(.*)$/i);
    if (themeMatch) {
      theme = themeMatch[1].replace(/\.$/, "").trim();
      matched = true;
      continue;
    }
    const atoresMatch = trimmed.match(/^Atores:\s*(.*)$/i);
    if (atoresMatch) {
      atores = splitList(atoresMatch[1].replace(/\.$/, ""));
      matched = true;
      continue;
    }
    if (/^Requisitos funcionais relevantes:\s*$/i.test(trimmed)) {
      inRequisitos = true;
      matched = true;
      continue;
    }
    if (inRequisitos && /^[-*]\s+/.test(trimmed)) {
      requisitos.push(trimmed.replace(/^[-*]\s+/, "").trim());
      continue;
    }
    inRequisitos = false;
  }

  return matched ? { theme, atores, requisitos } : null;
}

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

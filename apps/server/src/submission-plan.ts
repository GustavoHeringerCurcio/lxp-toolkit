/**
 * Planned delivery format for an activity.
 *
 * The answer-confidence gate must judge the draft against what the student will
 * actually deliver (TXT/PDF/DOCX, template fill, appended UML page). This module
 * turns the activity + enabled abilities + template detection into one
 * deterministic plan, shared by the gate and the generation prompt. It must stay
 * in sync with the web-side `defaultSendMode` in `apps/web/src/lib/send.ts`.
 */
import { artifactAbilities } from "./abilities.js";
import type { AbilityId, AiConfig, SendMode } from "./types.js";

/** A delivery mode that may not be a portal `SendMode` (quiz/forum/mark). */
export type PlannedDelivery = SendMode | "quiz" | "forum" | "mark";

export interface SubmissionPlanInput {
  kind: string;
  remoteFiles?: { filename: string | null }[];
}

export interface SubmissionPlan {
  delivery: PlannedDelivery;
  /** Enabled artifact abilities (e.g. `uml_diagram`). */
  artifacts: AbilityId[];
  /** A professor-provided `.docx` model is present. */
  hasDocxTemplate: boolean;
  /** The activity asks for a template/table to be filled. */
  wantsTemplate: boolean;
  /** Field labels requested by the activity (empty when none). */
  templateFields: string[];
  /** A UML diagram page will be appended to the final file. */
  diagram: boolean;
}

export function hasDocxTemplate(files: { filename: string | null }[]): boolean {
  return files.some((f) => /\.docx$/i.test(f.filename ?? ""));
}

/**
 * Resolve the default delivery plan. Mirrors the web send dialog:
 * `.docx` when a model is attached, PDF when a file artifact is enabled,
 * otherwise plain text. `wantsTemplate` adds the fill contract but does not by
 * itself change the delivery mode.
 */
export function resolveSubmissionPlan(
  e: SubmissionPlanInput,
  cfg: AiConfig,
  overrides: Partial<Record<AbilityId, boolean>> = {},
  opts: { wantsTemplate?: boolean; templateFields?: string[] } = {},
): SubmissionPlan {
  const artifacts = artifactAbilities(cfg, overrides);
  const docx = hasDocxTemplate(e.remoteFiles ?? []);
  const diagram = artifacts.includes("uml_diagram");
  const wantsTemplate = opts.wantsTemplate === true;

  let delivery: PlannedDelivery;
  if (e.kind === "quiz") delivery = "quiz";
  else if (e.kind === "forum") delivery = "forum";
  else if (e.kind === "mark") delivery = "mark";
  else if (e.kind !== "upload") delivery = "text";
  else if (docx) delivery = "docx";
  else if (diagram) delivery = "pdf";
  else delivery = "text";

  return {
    delivery,
    artifacts,
    hasDocxTemplate: docx,
    wantsTemplate,
    templateFields: opts.templateFields ?? [],
    diagram,
  };
}

const RENDER_NOTE =
  "O rascunho é o texto base: títulos, listas, tabelas e lacunas em Markdown serão renderizados no arquivo final.";

/** One human-readable line describing the final delivery (for the gate prompt). */
export function describeSubmissionPlan(plan: SubmissionPlan): string {
  switch (plan.delivery) {
    case "quiz":
      return "Quiz: as alternativas são marcadas no portal; não há arquivo nem texto corrido a entregar.";
    case "forum":
      return "Fórum: uma publicação em texto será enviada ao portal. Não há arquivo a anexar.";
    case "mark":
      return "A atividade é marcada como concluída; não há resposta em texto nem arquivo.";
    case "docx": {
      const fill = plan.wantsTemplate || plan.hasDocxTemplate
        ? " preenchido a partir do modelo do professor"
        : "";
      const diagram = plan.diagram
        ? " e uma página de diagrama UML anexada automaticamente"
        : "";
      return `DOCX${fill}${diagram}. ${RENDER_NOTE}`;
    }
    case "pdf": {
      const diagram = plan.diagram
        ? " com uma página de diagrama UML anexada automaticamente"
        : "";
      return `PDF${diagram}. ${RENDER_NOTE}`;
    }
    case "image":
      return "Imagem: o aluno envia uma captura de tela da atividade.";
    case "txt":
      return "Arquivo TXT: o rascunho será salvo como texto simples.";
    case "fill":
      return `PDF preenchido a partir do modelo do professor. ${RENDER_NOTE}`;
    default:
      return "Texto simples: o rascunho será enviado como está.";
  }
}

/**
 * Extra contract lines the gate/generator should honor (template fields, project
 * in use, structural hint). Returns "" when there is nothing to add.
 */
export function describeSubmissionContract(
  plan: SubmissionPlan,
  extra: { projectTitle?: string; formatHint?: string } = {},
): string {
  const parts: string[] = [];
  if (plan.wantsTemplate && plan.templateFields.length) {
    parts.push(
      `Preencha os campos/colunas pedidos pelo professor: ${plan.templateFields.join(", ")}.`,
    );
  }
  if (extra.formatHint?.trim()) parts.push(extra.formatHint.trim());
  if (extra.projectTitle?.trim()) {
    parts.push(`O aluno optou por usar o projeto "${extra.projectTitle.trim()}".`);
  }
  return parts.join("\n");
}

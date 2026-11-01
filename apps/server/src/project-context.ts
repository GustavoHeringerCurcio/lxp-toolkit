/**
 * Activity project context + template detection.
 *
 * Project context is explicit: the single project in `project_source`
 * ("my college project") is injected only when the activity or its module
 * opts in. The app never guesses whether an activity "needs a project".
 *
 * Template detection stays lazy: the cheap model fills `wants_template` /
 * `template_fields` in `activity_project`, gated by `projectAutoDetect`.
 */
import { createHash } from "node:crypto";
import { detectActivityRelevance } from "./ai.js";
import { resolveExtraInstructions } from "./prompt.js";
import { buildExternalProjectBlock } from "./project-source.js";
import { getActivityProject, getModuleProjectDefault, getProjectSource, saveActivityProject } from "./store.js";
import type { AiConfig, Exercise } from "./types.js";

const STRONG_SIGNAL =
  /\b(seu|teu|nosso|do grupo|da equipe)\s+(projeto|sistema|site|api|app|tema)\b|\b(caso de uso|casos de uso|diagrama de caso|escopo do projeto|requisitos do projeto|projeto do grupo|tema do grupo|escolha um tema|defina o tema|preencha a tabela|preencha o quadro|preencha o modelo|preencha os campos|complete a tabela|complete o quadro|complete o modelo|siga o modelo)\b/i;
const WEAK_SIGNAL =
  /\bprojeto\b|\btema\b|\bgrupo\b|\bequipe\b|\bcaso de uso\b|\brequisit|\btabela\b|\bquadro\b|\bmodelo\b|\bpreench|\bcomplete\b|\bformul[aá]rio\b|\bcampos\b|\btemplate\b/i;

export type ProjectSignal = "strong" | "weak" | "none";

/** Cheap regex pre-pass so obvious template cases never hit the model. */
export function projectSignal(text: string): ProjectSignal {
  const t = text ?? "";
  if (STRONG_SIGNAL.test(t)) return "strong";
  if (WEAK_SIGNAL.test(t)) return "weak";
  return "none";
}

/** Bump when the detection semantics change, to invalidate cached rows. */
const DETECT_VERSION = "v3";

/** Stable hash of the activity fields that affect template detection. */
export function activityContentHash(e: Exercise): string {
  const files = e.remoteFiles.map((f) => f.filename ?? f.url).join("|");
  return createHash("sha256")
    .update(`${DETECT_VERSION}\n${e.title}\n${e.instructionsText}\n${files}`)
    .digest("hex");
}

export type ProjectOrigin = "activity" | "module" | "off";

/** Effective project switch: explicit activity choice wins over the module default. */
export function resolveProjectEnabled(useProject: boolean | null, moduleDefault: boolean): boolean {
  return useProject ?? moduleDefault;
}

/** Where the effective switch came from (for the UI label). */
export function resolveProjectOrigin(useProject: boolean | null, moduleDefault: boolean): ProjectOrigin {
  if (useProject !== null) return "activity";
  return moduleDefault ? "module" : "off";
}

export interface TemplateAnalysis {
  wantsTemplate: boolean;
  templateFields: string[];
}

/**
 * Detect (and cache) whether the activity asks to fill a professor-provided
 * template/table. Project context is intentionally not involved.
 */
export async function detectActivityTemplate(
  cfg: AiConfig,
  e: Exercise,
  opts: { notes?: string } = {},
): Promise<TemplateAnalysis> {
  const hash = activityContentHash(e);
  const cached = await getActivityProject(e.id);
  if (cached && cached.contentHash === hash) {
    return { wantsTemplate: cached.wantsTemplate, templateFields: cached.templateFields };
  }

  let wantsTemplate = false;
  let templateFields: string[] = [];
  const signal = projectSignal(`${e.title}\n${e.instructionsText}`);
  if (signal !== "none") {
    try {
      const rel = await detectActivityRelevance(cfg, e, opts.notes ?? "");
      wantsTemplate = rel.wantsTemplate;
      templateFields = rel.templateFields;
    } catch {
      /* detection is best-effort */
    }
  }

  await saveActivityProject(e.id, { wantsTemplate, templateFields, contentHash: hash });
  return { wantsTemplate, templateFields };
}

export interface ResolvedProjectContext {
  /** Explicit switch state (activity override > module default > off). */
  enabled: boolean;
  origin: ProjectOrigin;
  /** Prompt-ready external project block ("" when disabled or not configured). */
  external: string;
  /** The student's project title, for the diagram/system boundary. */
  externalTitle: string;
  /** True when project_source has any metadata or uploaded files. */
  configured: boolean;
}

/**
 * Resolve the project context actually injected into a generation. Never
 * throws: an unconfigured project yields `enabled` true with an empty block so
 * the UI can prompt the student to fill it in.
 */
export async function resolveProjectContext(e: Exercise): Promise<ResolvedProjectContext> {
  const [activity, moduleDefault, source] = await Promise.all([
    getActivityProject(e.id).catch(() => null),
    getModuleProjectDefault(e.moduleId).catch(() => false),
    getProjectSource().catch(() => null),
  ]);

  const useProject = activity?.useProject ?? null;
  const enabled = resolveProjectEnabled(useProject, moduleDefault);
  const origin = resolveProjectOrigin(useProject, moduleDefault);
  const externalTitle = source?.title.trim() ?? "";
  const external = await buildExternalProjectBlock().catch(() => "");

  return {
    enabled,
    origin,
    external: enabled ? external : "",
    externalTitle,
    configured: Boolean(external),
  };
}

/** Merge the per-exercise override with the resolved project/format instructions. */
export function composeEffectiveInstructions(overrideRaw: string, ...blocks: string[]): string {
  const parts = [resolveExtraInstructions(overrideRaw), ...blocks];
  return parts
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * A generic structural hint for template-style activities ("fill the table",
 * "complete the sheet") — independent of the activity kind.
 */
export function projectFormatHint(e: Exercise): string {
  const hay = `${e.title}\n${e.instructionsText}`;
  const wantsTable = /\|.*\|/.test(hay) || /tabela|quadro|preench|complete|fill/i.test(hay);
  if (!wantsTable) return "";
  return (
    "Se a atividade pede para preencher uma tabela/quadro, responda com a tabela já preenchida em Markdown: " +
    'uma linha de cabeçalho, uma linha separadora (|---|---|) e as linhas de dados, com as colunas separadas por "|". ' +
    "Preencha todas as células pedidas e não deixe nenhuma em branco."
  );
}

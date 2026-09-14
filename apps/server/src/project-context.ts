/**
 * Generic project context for activities.
 *
 * Two levels are resolved lazily (cheap model) and cached in Postgres:
 *   - the course MAIN project (theme/actors/requirements), and
 *   - per-activity relevance, plus an optional quick project override.
 *
 * `analyzeActivity` is the single entry point; the server calls it both for the
 * UI panel and right before generating an answer, so the injected context is
 * always the one the student sees.
 */
import { createHash } from "node:crypto";
import { detectActivityRelevance, detectCourseProject } from "./ai.js";
import { courseContextText } from "./extract.js";
import { resolveExtraInstructions } from "./prompt.js";
import { buildExternalProjectBlock } from "./project-source.js";
import {
  getActivityProject,
  getProjectProfile,
  getProjectSource,
  saveActivityProject,
  saveProjectProfile,
} from "./store.js";
import type { ActivityProject, AiConfig, Exercise, ProjectProfile, ProjectSource } from "./types.js";

const STRONG_SIGNAL =
  /\b(seu|teu|nosso|do grupo|da equipe)\s+(projeto|sistema|site|api|app|tema)\b|\b(caso de uso|casos de uso|diagrama de caso|escopo do projeto|requisitos do projeto|projeto do grupo|tema do grupo|escolha um tema|defina o tema|preencha a tabela|preencha o quadro|preencha o modelo|preencha os campos|complete a tabela|complete o quadro|complete o modelo|siga o modelo)\b/i;
const WEAK_SIGNAL =
  /\bprojeto\b|\btema\b|\bgrupo\b|\bequipe\b|\bcaso de uso\b|\brequisit|\btabela\b|\bquadro\b|\bmodelo\b|\bpreench|\bcomplete\b|\bformul[aá]rio\b|\bcampos\b|\btemplate\b/i;

export type ProjectSignal = "strong" | "weak" | "none";

/** Cheap regex pre-pass so obvious cases never hit the model. */
export function projectSignal(text: string): ProjectSignal {
  const t = text ?? "";
  if (STRONG_SIGNAL.test(t)) return "strong";
  if (WEAK_SIGNAL.test(t)) return "weak";
  return "none";
}

/** Bump when the detection semantics change, to invalidate cached rows. */
const DETECT_VERSION = "v2";

/** Stable hash of the activity fields that affect relevance. */
export function activityContentHash(e: Exercise): string {
  const files = e.remoteFiles.map((f) => f.filename ?? f.url).join("|");
  return createHash("sha256")
    .update(`${DETECT_VERSION}\n${e.title}\n${e.instructionsText}\n${files}`)
    .digest("hex");
}

export interface EffectiveProfile {
  theme: string;
  atores: string[];
  requisitos: string[];
  /** Where the profile came from. */
  origin: "main" | "activity";
}

export interface AnalyzeResult {
  needsProject: boolean;
  /** True when the activity asks to fill a professor-provided template/table. */
  wantsTemplate: boolean;
  /** Field labels the professor wants, in order (empty when none). */
  templateFields: string[];
  confidence: number | null;
  intent: string | null;
  reason: string | null;
  source: "auto" | "manual";
  mainProfile: ProjectProfile | null;
  activity: ActivityProject;
  proposed: { theme: string; atores: string[]; requisitos: string[] } | null;
  effective: EffectiveProfile | null;
}

/**
 * Minimum confidence for an AUTO-detected project to be injected. A manual
 * profile is always trusted; a low-confidence auto guess is not, so a wrong
 * domain never silently grounds a submission.
 */
export const PROJECT_CONFIDENCE_MIN = 0.6;

export function isProjectConfident(profile: {
  source: ProjectSource;
  confidence: number | null;
}): boolean {
  if (profile.source === "manual") return true;
  return profile.confidence == null || profile.confidence >= PROJECT_CONFIDENCE_MIN;
}

/** The profile that will be injected: the activity's quick project or the main one. */
export function effectiveProfileFor(
  main: ProjectProfile | null,
  activity: ActivityProject,
): EffectiveProfile | null {
  if (!activity.needsProject || activity.profileMode === "none") return null;
  if (activity.profileMode === "activity") {
    return {
      theme: activity.theme ?? "",
      atores: activity.atores,
      requisitos: activity.requisitos,
      origin: "activity",
    };
  }
  if (!main || !isProjectConfident(main)) return null;
  return { theme: main.theme, atores: main.atores, requisitos: main.requisitos, origin: "main" };
}

/** Render an effective profile as a prompt-ready instruction block. */
export function buildProjectInstructionBlock(profile: EffectiveProfile): string {
  const lines: string[] = [];
  const theme = profile.theme.trim();
  if (theme) lines.push(`Contexto do projeto: ${theme}.`);
  if (profile.atores.length) lines.push(`Atores: ${profile.atores.join(", ")}.`);
  if (profile.requisitos.length) {
    lines.push("Requisitos funcionais relevantes:");
    for (const r of profile.requisitos) lines.push(`- ${r}`);
  }
  if (lines.length) {
    lines.push("Use este contexto para preencher a atividade, sem mencionar que ele foi fornecido.");
  }
  return lines.join("\n");
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

/** Merge the per-exercise override with the resolved project/format instructions. */
export function composeEffectiveInstructions(overrideRaw: string, ...blocks: string[]): string {
  const parts = [resolveExtraInstructions(overrideRaw), ...blocks];
  return parts
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Resolve (and lazily detect) the project context for an activity. Never
 * throws: detection failures leave the cached/neutral values in place.
 */
export async function analyzeActivity(
  cfg: AiConfig,
  e: Exercise,
  opts: { notes?: string; forceProfile?: boolean } = {},
): Promise<AnalyzeResult> {
  const hash = activityContentHash(e);
  let activity = await getActivityProject(e.id);
  let proposed: { theme: string; atores: string[]; requisitos: string[] } | null = null;

  const cacheValid =
    activity != null && activity.source === "auto" && activity.contentHash === hash;

  // A strong textual signal ("casos de uso", "preencha a tabela do projeto", …)
  // means the activity always needs the student's project — even when the
  // per-activity profile mode is "none" (which only opts out of the *course*
  // profile, not of the student's own declared project).
  const strongSignal = projectSignal(`${e.title}\n${e.instructionsText}`) === "strong";

  if (!cacheValid) {
    const isManual = activity?.source === "manual";
    let needsProject = activity?.needsProject ?? false;
    let wantsTemplate = activity?.wantsTemplate ?? false;
    let templateFields = activity?.templateFields ?? [];
    let confidence: number | null = activity?.confidence ?? null;
    let intent: string | null = activity?.intent ?? null;
    let reason: string | null = activity?.reason ?? null;
    let model: string | null = activity?.model ?? null;

    if (!isManual) {
      const signal = projectSignal(`${e.title}\n${e.instructionsText}`);
      if (signal === "strong" || signal === "weak") {
        // Let the cheap model classify the activity generically (project and/or
        // template-fill). A strong textual signal only forces needsProject.
        try {
          const rel = await detectActivityRelevance(cfg, e, opts.notes ?? "");
          wantsTemplate = rel.wantsTemplate;
          templateFields = rel.templateFields;
          if (signal === "strong") {
            needsProject = true;
            confidence = 0.9;
          } else {
            needsProject = rel.needsProject;
            confidence = rel.confidence;
          }
          intent = rel.intent || intent;
          reason = rel.reason || reason;
          proposed = rel.proposed;
          model = rel.model;
        } catch {
          if (signal === "strong") {
            needsProject = true;
            confidence = 0.9;
          }
          /* keep previous values */
        }
      } else {
        needsProject = false;
        confidence = 0.9;
      }
    }

    if (strongSignal) needsProject = true;

    activity = await saveActivityProject(e.id, {
      needsProject,
      wantsTemplate,
      templateFields,
      profileMode: activity?.profileMode ?? "main",
      confidence,
      intent,
      reason,
      contentHash: hash,
      source: activity?.source ?? "auto",
      model,
    });
  }

  // Defensive: `saveActivityProject` always returns a row, but narrow for TS.
  if (!activity) {
    activity = await saveActivityProject(e.id, {
      needsProject: false,
      contentHash: hash,
      source: "auto",
    });
  }

  // Ensure the course main profile exists when a project/template is needed.
  let main = await getProjectProfile(e.courseId);
  const needsMain = activity.needsProject || activity.wantsTemplate;
  const shouldDetectProfile =
    (needsMain && (!main || main.source === "auto")) || (opts.forceProfile === true && main?.source !== "manual");
  if (shouldDetectProfile) {
    try {
      // Never let the activity's own example material (e.g. the professor's
      // "Modelo/Resumo" with the clinic example) become the detected project.
      const ctx = await courseContextText(e.courseId, 8000, [e.id]).catch(() => "");
      const det = await detectCourseProject(cfg, e.courseName, ctx, activity.intent ? [activity.intent] : []);
      if (det.theme || det.atores.length || det.requisitos.length || det.suggestedThemes.length) {
        main = await saveProjectProfile(e.courseId, {
          theme: det.theme,
          atores: det.atores,
          requisitos: det.requisitos,
          suggestedThemes: det.suggestedThemes,
          confidence: det.confidence,
          model: det.model,
          contentHash: createHash("sha256").update(ctx).digest("hex"),
          source: "auto",
          raw: det,
        });
      }
    } catch {
      /* keep whatever we had */
    }
  }

  return {
    needsProject: activity.needsProject,
    wantsTemplate: activity.wantsTemplate,
    templateFields: activity.templateFields,
    confidence: activity.confidence,
    intent: activity.intent,
    reason: activity.reason,
    source: activity.source,
    mainProfile: main,
    activity,
    proposed,
    effective: effectiveProfileFor(main, activity),
  };
}

export interface ResolvedProjectContext {
  needsProject: boolean;
  /** Course/activity profile to inject (null when the external project wins). */
  effective: EffectiveProfile | null;
  /** Free-text external project block ("Meu projeto"); "" when none. */
  external: string;
  /** The student's project title, for the diagram/system boundary. */
  externalTitle: string;
}

/**
 * Resolve the project context actually injected into a generation. The
 * student's declared project ("Meu projeto") takes precedence over the
 * course-detected profile, while an explicit per-activity quick project wins
 * over both. Never throws — blocks come back empty when nothing is configured.
 */
export async function resolveProjectContext(
  cfg: AiConfig,
  e: Exercise,
  opts: { notes?: string; forceProfile?: boolean } = {},
): Promise<ResolvedProjectContext> {
  const analysis = await analyzeActivity(cfg, e, opts);
  if (!analysis.needsProject) {
    return { needsProject: false, effective: null, external: "", externalTitle: "" };
  }

  const source = await getProjectSource().catch(() => null);
  const externalTitle = source?.title.trim() ?? "";
  const hasExternal = Boolean(
    externalTitle ||
      source?.githubUrl.trim() ||
      source?.notes.trim() ||
      source?.readmeText.trim(),
  );
  const external = hasExternal ? await buildExternalProjectBlock().catch(() => "") : "";

  // Explicit quick project for this activity always wins.
  if (analysis.effective?.origin === "activity") {
    return { needsProject: true, effective: analysis.effective, external, externalTitle };
  }

  // Otherwise the student's own declared project wins over the course profile.
  if (hasExternal) {
    return { needsProject: true, effective: null, external, externalTitle };
  }

  return { needsProject: true, effective: analysis.effective, external: "", externalTitle };
}

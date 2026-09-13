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
import {
  getActivityProject,
  getProjectProfile,
  saveActivityProject,
  saveProjectProfile,
} from "./store.js";
import type { ActivityProject, AiConfig, Exercise, ProjectProfile } from "./types.js";

const STRONG_SIGNAL =
  /\b(seu|teu|nosso|do grupo|da equipe)\s+(projeto|sistema|site|api|app|tema)\b|\b(caso de uso|casos de uso|diagrama de caso|escopo do projeto|requisitos do projeto|projeto do grupo|tema do grupo|escolha um tema|defina o tema|preencha a tabela)\b/i;
const WEAK_SIGNAL = /\bprojeto\b|\btema\b|\bgrupo\b|\bequipe\b|\bcaso de uso\b|\brequisit/i;

export type ProjectSignal = "strong" | "weak" | "none";

/** Cheap regex pre-pass so obvious cases never hit the model. */
export function projectSignal(text: string): ProjectSignal {
  const t = text ?? "";
  if (STRONG_SIGNAL.test(t)) return "strong";
  if (WEAK_SIGNAL.test(t)) return "weak";
  return "none";
}

/** Stable hash of the activity fields that affect relevance. */
export function activityContentHash(e: Exercise): string {
  const files = e.remoteFiles.map((f) => f.filename ?? f.url).join("|");
  return createHash("sha256").update(`${e.title}\n${e.instructionsText}\n${files}`).digest("hex");
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
  confidence: number | null;
  intent: string | null;
  reason: string | null;
  source: "auto" | "manual";
  mainProfile: ProjectProfile | null;
  activity: ActivityProject;
  proposed: { theme: string; atores: string[]; requisitos: string[] } | null;
  effective: EffectiveProfile | null;
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
  if (!main) return null;
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

  if (!cacheValid) {
    const isManual = activity?.source === "manual";
    let needsProject = activity?.needsProject ?? false;
    let confidence: number | null = activity?.confidence ?? null;
    let intent: string | null = activity?.intent ?? null;
    let reason: string | null = activity?.reason ?? null;
    let model: string | null = activity?.model ?? null;

    if (!isManual) {
      const signal = projectSignal(`${e.title}\n${e.instructionsText}`);
      if (signal === "strong") {
        needsProject = true;
        confidence = 0.9;
      } else if (signal === "weak") {
        try {
          const rel = await detectActivityRelevance(cfg, e, opts.notes ?? "");
          needsProject = rel.needsProject;
          confidence = rel.confidence;
          intent = rel.intent || intent;
          reason = rel.reason || reason;
          proposed = rel.proposed;
          model = rel.model;
        } catch {
          /* keep previous values */
        }
      } else {
        needsProject = false;
        confidence = 0.9;
      }
    }

    activity = await saveActivityProject(e.id, {
      needsProject,
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

  // Ensure the course main profile exists when a project is needed.
  let main = await getProjectProfile(e.courseId);
  const shouldDetectProfile =
    (activity.needsProject && (!main || main.source === "auto")) || (opts.forceProfile === true && main?.source !== "manual");
  if (shouldDetectProfile) {
    try {
      const ctx = await courseContextText(e.courseId).catch(() => "");
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

import type { AiRequest, Exercise, Answers, Overrides } from "./types.js";
import { loadAiConfig, DEFAULT_AI_REQUEST } from "./config.js";
import { parseAiRequest } from "./prompt.js";

export interface ExerciseView extends Exercise {
  answer: string | null;
  answerSource: "ai" | "manual" | null;
  notes: string;
  promptOverride: string | null;
  hidden: boolean;
  tag: string | null;
  /** Effective AiRequest for the exercise: stored override parsed, else default. */
  aiRequest: AiRequest;
  /** True when the exercise has a per-exercise override stored. */
  hasAiOverride: boolean;
  /** Raw JSON (override or default) that produced aiRequest. */
  aiRequestJson: string;
}

/**
 * Resolve the effective raw AiRequest JSON for an exercise: the stored override
 * (overrides[id].aiRequest) wins; otherwise the global ai-config default. When a
 * legacy plain-text `notes` exists and there is no override yet, it is folded
 * into the request's `contexto` so no prior context is silently dropped.
 */
export function effectiveAiRequestJson(exercises: { id: number }[], overrides: Overrides): Record<string, string> {
  const cfg = loadAiConfig();
  const defaultRaw = cfg.ai_request_default ?? JSON.stringify(DEFAULT_AI_REQUEST, null, 2);
  const defaultParsed = parseAiRequest(defaultRaw);
  const map: Record<string, string> = {};
  for (const e of exercises) {
    const o = overrides[String(e.id)] ?? {};
    const key = String(e.id);
    if (typeof o?.aiRequest === "string") {
      map[key] = o.aiRequest;
      continue;
    }
    const legacy = typeof o?.notes === "string" && o.notes.trim() ? o.notes.trim() : "";
    if (legacy) {
      const seeded: AiRequest = {
        ...defaultParsed,
        perfil: defaultParsed.perfil,
        contexto: legacy,
        instrucoes: defaultParsed.instrucoes,
        prompt: undefined,
      };
      map[key] = JSON.stringify(seeded, null, 2);
      continue;
    }
    map[key] = defaultRaw;
  }
  return map;
}

export function enrich(exercises: Exercise[], answers: Answers, overrides: Overrides): ExerciseView[] {
  const requests = effectiveAiRequestJson(exercises, overrides);
  return exercises.map((e) => {
    const o = overrides[String(e.id)] ?? {};
    const a = answers[String(e.id)];
    return {
      ...e,
      answer: a?.answer ?? null,
      answerSource: a?.source ?? null,
      notes: o.notes ?? "",
      promptOverride: o.promptOverride ?? null,
      hidden: o.hide === true,
      tag: o.tag ?? null,
      aiRequest: parseAiRequest(requests[String(e.id)]),
      hasAiOverride: typeof o?.aiRequest === "string",
      aiRequestJson: requests[String(e.id)],
    };
  });
}

/** Ordering: open-with-deadline (asc) → open-no-deadline → expired (asc by deadline) → done. */
export function compareDeadline(a: { status: string; daysLeft: number | null; deadlineAt: string | null; title: string }, b: { status: string; daysLeft: number | null; deadlineAt: string | null; title: string }): number {
  const rank = (s: string): number => (s === "open" ? 0 : s === "expired" ? 1 : 2);
  const r = rank(a.status) - rank(b.status);
  if (r !== 0) return r;
  const da = a.daysLeft == null ? Infinity : a.daysLeft;
  const db = b.daysLeft == null ? Infinity : b.daysLeft;
  const d = da - db;
  if (d !== 0) return d;
  return a.title.localeCompare(b.title, "pt");
}

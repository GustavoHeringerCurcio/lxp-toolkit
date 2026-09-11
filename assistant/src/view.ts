import type { AiRequest, Exercise, Answers, Overrides, QuizSelection } from "./types.js";
import { loadAiConfig } from "./config.js";
import { parseAiRequest } from "./prompt.js";

export interface ExerciseView extends Exercise {
  answer: string | null;
  answerSource: "ai" | "manual" | null;
  /** Chosen options for quiz answers (empty for uploads). */
  selections: QuizSelection[];
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
 * Resolve the effective message template for an exercise: the stored override
 * (overrides[id].aiRequest) wins; otherwise the global ai-config default. When a
 * legacy plain-text `notes` exists and there is no override yet, it is folded
 * into the template's {observacoes} slot so no prior context is silently dropped.
 */
export function effectiveAiRequestJson(exercises: { id: number }[], overrides: Overrides): Record<string, string> {
  const cfg = loadAiConfig();
  const defaultRaw = cfg.message_template;
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
      // Fold old free-form notes into the message template so nothing is lost.
      map[key] = defaultRaw.includes("{observacoes}")
        ? defaultRaw.replaceAll("{observacoes}", legacy)
        : `${defaultRaw}\n\n${legacy}`;
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
    const manual = o.manualStatus;
    const status = manual ?? e.status;
    const done = manual === "done" || e.done;
    return {
      ...e,
      status,
      done,
      answer: a?.answer ?? null,
      answerSource: a?.source ?? null,
      selections: a?.selections ?? [],
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

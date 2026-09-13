import type { AiRequest, Exercise, Answers, Overrides, ProfessorLink, QuizSelection } from "./types.js";
import type { OrgDirectory } from "./organizations.js";
import { normalizeName } from "./professor.js";
import { humanizeQuizAnswer, parseAiRequest } from "./prompt.js";
import { flavorFromTag } from "./build.js";

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
  /** Configured professor photo URL (`/api/professor-avatar/…`), or null. */
  professorPhotoUrl: string | null;
}

/**
 * Resolve the per-exercise extra instructions. Only a stored override
 * (`overrides[id].aiRequest`) contributes; there is no global default anymore,
 * so exercises without an override get an empty string. Notes are sent
 * separately through the `{observacoes}` activity section.
 */
export function effectiveExtraInstructions(exercises: { id: number }[], overrides: Overrides): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of exercises) {
    const o = overrides[String(e.id)] ?? {};
    map[String(e.id)] = typeof o?.aiRequest === "string" ? o.aiRequest : "";
  }
  return map;
}

export function enrich(
  exercises: Exercise[],
  answers: Answers,
  overrides: Overrides,
  professorLinks: ProfessorLink[] = [],
  orgDirectory?: OrgDirectory,
): ExerciseView[] {
  const requests = effectiveExtraInstructions(exercises, overrides);
  const linksById = new Map(professorLinks.map((l) => [l.professorId, l]));
  return exercises.map((e) => {
    const o = overrides[String(e.id)] ?? {};
    const a = answers[String(e.id)];
    const manual = o.manualStatus;
    const status = manual ?? e.status;
    const done = manual === "done" || e.done;
    const rawAnswer = a?.answer ?? null;
    const answer =
      rawAnswer && e.kind === "quiz" && e.questions.length
        ? humanizeQuizAnswer(rawAnswer, e.questions)
        : rawAnswer;
    // Precedence: personal link → org directory → nothing (icon/monogram).
    let professorPhotoUrl =
      (e.professorId != null ? linksById.get(e.professorId)?.photoUrl : undefined) || null;
    if (!professorPhotoUrl && orgDirectory) {
      if (e.professorId != null) professorPhotoUrl = orgDirectory.byId.get(e.professorId) ?? null;
      if (!professorPhotoUrl && e.professor) {
        professorPhotoUrl = orgDirectory.byName.get(normalizeName(e.professor)) ?? null;
      }
    }
    const manualFlavor = flavorFromTag(o.tag);
    return {
      ...e,
      flavor: manualFlavor ?? e.flavor,
      flavorSource: manualFlavor ? "manual" : e.flavorSource,
      status,
      done,
      answer,
      answerSource: a?.source ?? null,
      selections: a?.selections ?? [],
      notes: o.notes ?? "",
      promptOverride: o.promptOverride ?? null,
      hidden: o.hide === true,
      tag: o.tag ?? null,
      aiRequest: parseAiRequest(requests[String(e.id)]),
      hasAiOverride: typeof o?.aiRequest === "string",
      aiRequestJson: requests[String(e.id)],
      professorPhotoUrl,
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

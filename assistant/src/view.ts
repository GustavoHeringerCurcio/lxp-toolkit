import type { Exercise, Answers, Overrides } from "./types.js";

export interface ExerciseView extends Exercise {
  answer: string | null;
  notes: string;
  promptOverride: string | null;
  hidden: boolean;
  tag: string | null;
}

export function enrich(exercises: Exercise[], answers: Answers, overrides: Overrides): ExerciseView[] {
  return exercises.map((e) => {
    const o = overrides[String(e.id)] ?? {};
    const a = answers[String(e.id)];
    return {
      ...e,
      answer: a?.answer ?? null,
      notes: o.notes ?? "",
      promptOverride: o.promptOverride ?? null,
      hidden: o.hide === true,
      tag: o.tag ?? null,
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
  // put no-deadline opens before ones that had a deadline but expired? expired handled above.
  return a.title.localeCompare(b.title, "pt");
}

import type { Exercise } from "../types";
import { parseDeadlineTs } from "./status";

/**
 * Hidden items that can still require work/points: quizzes, uploads, forums,
 * and anything carrying a deadline, a gradebook link or a question bank. These
 * must never be hidden behind the "older versions" toggle — losing sight of one
 * of them can cost the student points.
 */
export function isActionableHidden(item: Exercise): boolean {
  if (item.kind === "quiz" || item.kind === "upload" || item.kind === "forum") return true;
  return item.hasDeadline || item.gradebookId != null || (item.questions?.length ?? 0) > 0;
}

/** A deadline strictly before `now` means the activity is already old/expired. */
export function isPastDeadline(
  item: Pick<Exercise, "deadlineAt">,
  now = Date.now(),
): boolean {
  const ts = parseDeadlineTs(item.deadlineAt);
  return ts != null && ts < now;
}

/**
 * God's Eye only lists work still ahead: not done and due from today onward.
 * Undated items are not "next" and are dropped, except graded work with a
 * gradebook link — that can carry points, so it is never hidden.
 */
export function isCurrentHidden(
  item: Pick<Exercise, "done" | "deadlineAt" | "gradebookId">,
  now = Date.now(),
): boolean {
  if (item.done) return false;
  const ts = parseDeadlineTs(item.deadlineAt);
  if (ts != null) return ts >= now;
  return item.gradebookId != null;
}

/**
 * Items shown in the primary God's Eye list. Old (past-deadline/done) items are
 * never shown. Duplicates are filtered only when they are not actionable.
 */
export function visibleHiddenItems(
  items: Exercise[],
  showDuplicates: boolean,
  now = Date.now(),
): Exercise[] {
  const current = items.filter((item) => isCurrentHidden(item, now));
  if (showDuplicates) return current;
  return current.filter((item) => !item.duplicate || isActionableHidden(item));
}

/** Non-actionable duplicates among the current hidden items (toggle label). */
export function hiddenDuplicatesCount(items: Exercise[], now = Date.now()): number {
  return items.filter(
    (item) => isCurrentHidden(item, now) && item.duplicate && !isActionableHidden(item),
  ).length;
}

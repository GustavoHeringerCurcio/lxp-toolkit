/** Percentage of correct answers (0 when there are no questions). */
export function scorePct(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

export interface Verdict {
  key: string;
  cls: string;
}

/** Readiness verdict tiers for the gamified result screen. */
export function verdictFor(pct: number): Verdict {
  if (pct >= 70) return { key: "training.readyHigh", cls: "text-ok" };
  if (pct >= 50) return { key: "training.readyMid", cls: "text-soon" };
  return { key: "training.readyLow", cls: "text-late" };
}

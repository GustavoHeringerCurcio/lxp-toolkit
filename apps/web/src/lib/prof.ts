/**
 * Professor helpers — professors are secondary identity and never own a color.
 * Color is reserved for subjects (`lib/subject.ts`), so the old raw-hex accent
 * palette is gone and the "no raw color in TSX" rule holds everywhere.
 */

/** Drop the "Prof./Profa." prefix for display. */
export function professorLabel(name: string): string {
  return name.replace(/^Profa?\.\s*/i, "");
}

/** 1–2 letter initials for the neutral professor avatar. */
export function professorInitials(name: string | null | undefined): string {
  const words = professorLabel((name ?? "").trim())
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

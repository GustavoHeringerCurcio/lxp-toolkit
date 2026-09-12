/**
 * Deterministic accent per professor — same color for professor + its module.
 *
 * Colors are keyed by the stable portal id (`context.teachers[].safeaUserId`),
 * so a rename never changes the color. Colors are data, not theme tokens (the
 * one documented exception to the "no raw hex" rule — DESIGN.md §7). Palette
 * tuned for Folio: warm, muted, distinguishable on both paper and espresso.
 */
const BY_ID: Record<number, string> = {
  5723877: "#c2703d", // Débora Amorim — terracotta
  12167264: "#8a9a3e", // Leonardo Dias — olive
  1733436: "#3e8f8a", // Marcelo Passos — muted teal
  1715709: "#8d6bb8", // Osni Silva — plum
  5996976: "#c2638a", // Rafael Iacillo — rose
};

const FALLBACK = [
  "#c2703d", "#8a9a3e", "#3e8f8a", "#8d6bb8",
  "#c2638a", "#5b84b8", "#b8923a", "#a05a78",
];

/** Accent for a professor, preferring the stable id and falling back to the name. */
export function accentFor(professorId: number | null, name?: string | null): string {
  if (professorId != null && BY_ID[professorId]) return BY_ID[professorId];
  const key = name ?? (professorId != null ? String(professorId) : "");
  if (!key) return "#94a3b8";
  let h = 2166136261;
  for (const ch of key) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

/** Drop the "Prof./Profa." prefix for display. */
export function professorLabel(name: string): string {
  return name.replace(/^Profa?\.\s*/i, "");
}

/**
 * Deterministic accent per professor — same color for professor + its module.
 *
 * Colors are data, not theme tokens (the one documented exception to the
 * "no raw hex" rule — DESIGN.md §7). Palette tuned for Folio: warm, muted,
 * distinguishable on both paper and espresso.
 */
const BY_PROFESSOR: Record<string, string> = {
  "Profa. Débora Amorim": "#c2703d", // terracotta
  "Prof. Leonardo Dias": "#8a9a3e", // olive
  "Prof. Marcelo Passos": "#3e8f8a", // muted teal
  "Prof. Osni Silva": "#8d6bb8", // plum
  "Prof. Rafael Iacillo": "#c2638a", // rose
};

const FALLBACK = [
  "#c2703d", "#8a9a3e", "#3e8f8a", "#8d6bb8",
  "#c2638a", "#5b84b8", "#b8923a", "#a05a78",
];

export function accentFor(prof: string | null): string {
  if (!prof) return "#94a3b8";
  if (BY_PROFESSOR[prof]) return BY_PROFESSOR[prof];
  let h = 2166136261;
  for (const ch of prof) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

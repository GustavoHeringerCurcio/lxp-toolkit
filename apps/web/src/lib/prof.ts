/**
 * Deterministic accent per professor — same color for professor + its module.
 *
 * Colors are assigned explicitly (spread across the wheel: orange/lime/teal/
 * violet/pink) so the professors in this course never look alike. Unknown names
 * fall back to a hash over a spaced palette.
 */
const BY_PROFESSOR: Record<string, string> = {
  "Profa. Débora Amorim": "#f97316", // orange
  "Prof. Leonardo Dias": "#84cc16", // lime
  "Prof. Marcelo Passos": "#14b8a6", // teal
  "Prof. Osni Silva": "#8b5cf6", // violet
  "Prof. Rafael Iacillo": "#ec4899", // pink
};

const FALLBACK = [
  "#f97316", "#84cc16", "#14b8a6", "#8b5cf6",
  "#ec4899", "#0ea5e9", "#eab308", "#c026d3",
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

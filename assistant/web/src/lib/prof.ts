/** Deterministic accent per professor — same color for professor + its module. */
const ACCENTS = [
  "#22d3ee", // cyan
  "#e879f9", // fuchsia
  "#fb923c", // orange
  "#a3e635", // lime
  "#a78bfa", // violet
  "#f472b6", // pink
  "#2dd4bf", // teal
  "#facc15", // yellow
];

export function accentFor(prof: string | null): string {
  if (!prof) return "#94a3b8";
  let h = 0;
  for (const ch of prof) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

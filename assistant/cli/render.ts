import type { ExerciseView } from "../src/view.js";

export const isTTY = process.stdout.isTTY === true;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

export const color = {
  dim: (s: string) => (isTTY ? `${C.dim}${s}${C.reset}` : s),
  bold: (s: string) => (isTTY ? `${C.bold}${s}${C.reset}` : s),
};

function fg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isTTY ? `\x1b[38;2;${r};${g};${b}m` : "";
}

export const TYPES = { quiz: "❓ Quiz", upload: "📤 Tarefa" };

/** Deadline badge — same semantics as the web app, in pt-BR. */
export function deadlineLabel(e: ExerciseView): { text: string; hex: string } {
  if (e.done) return { text: "concluída", hex: "#2ea25b" };
  if (e.status === "expired") {
    const n = e.daysLeft == null ? 0 : Math.abs(e.daysLeft);
    return { text: n === 0 ? "atrasado" : `atrasado ${n}d`, hex: "#e05252" };
  }
  if (e.daysLeft == null) return { text: "sem prazo", hex: "#64748b" };
  if (e.daysLeft <= 1) return { text: e.daysLeft === 0 ? "vence hoje" : "vence amanhã", hex: "#e6a23c" };
  if (e.daysLeft <= 3) return { text: `vence em ${e.daysLeft}d`, hex: "#e6a23c" };
  return { text: `vence em ${e.daysLeft}d`, hex: "#3f7cf3" };
}

export function deadlineChip(e: ExerciseView): string {
  const d = deadlineLabel(e);
  return isTTY ? `${fg(d.hex)}${d.text}${C.reset}` : d.text;
}

export function typeChip(e: ExerciseView): string {
  const t = TYPES[e.kind];
  return isTTY ? color.dim(t) : t;
}

/** Deterministic accent color per professor — same as the web app palette. */
const ACCENTS = ["#14b8a6", "#d946ef", "#f97316", "#84cc16", "#8b5cf6", "#ec4899", "#06b6d4", "#eab308"];
export function accentFor(prof: string | null): string {
  if (!prof) return "#64748b";
  let h = 0;
  for (const ch of prof) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function contextLine(e: ExerciseView): string {
  const acc = accentFor(e.professor);
  const parts: string[] = [];
  if (e.professor) parts.push(`👤 ${e.professor}`);
  if (e.moduleName) parts.push(e.moduleName);
  const text = parts.join(" · ");
  return isTTY ? `${fg(acc)}${text}${C.reset}` : text;
}

export function icon(e: ExerciseView): string {
  if (e.done) return "✅";
  return e.kind === "quiz" ? "❓" : "📤";
}

export function kindLabel(e: ExerciseView): string {
  return e.kind === "quiz" ? "Quiz" : "Tarefa";
}

import { statusChip } from "../src/status.js";
import type { ExerciseView } from "../src/view.js";

export const isTTY = process.stdout.isTTY === true;

export const color = {
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  cyan: (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
};

export function chip(e: ExerciseView): string {
  const c = statusChip(e);
  return isTTY ? `${c.color}${c.label}\x1b[0m` : c.label;
}

export function kindLabel(kind: string): string {
  return kind === "quiz" ? "Quiz" : "Upload";
}

export function deadlineSuffix(e: ExerciseView): string {
  if (!e.deadlineAt) return "";
  const dl = e.deadlineAt.slice(0, 16).replace("T", " ");
  return ` (${dl})`;
}

export function icon(kind: string, done: boolean): string {
  return done ? "✅" : kind === "quiz" ? "❓" : "📤";
}

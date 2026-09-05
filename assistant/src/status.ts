import type { Exercise, ExerciseStatus } from "./types.js";

const DAY_MS = 86_400_000;

/** Parse a portal deadline ("YYYY-MM-DD HH:MM:SS") as local time. */
export function parseDeadline(deadlineAt: string | null): number | null {
  if (!deadlineAt) return null;
  const d = new Date(deadlineAt.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function daysLeft(deadlineAt: string | null): number | null {
  const t = parseDeadline(deadlineAt);
  return t == null ? null : Math.floor((t - Date.now()) / DAY_MS);
}

export function computeStatus(done: boolean, hasDeadline: boolean, deadlineAt: string | null): ExerciseStatus {
  if (done) return "done";
  if (hasDeadline && deadlineAt) {
    const dl = parseDeadline(deadlineAt);
    if (dl != null && dl < Date.now()) return "expired";
  }
  return "open";
}

export interface StatusChip {
  label: string;
  tone: "done" | "expired" | "due" | "soon" | "open" | "plain";
  color: string; // ANSI color code text for terminal
}

export function statusChip(e: Pick<Exercise, "status" | "deadlineAt" | "daysLeft" | "kind">): StatusChip {
  if (e.status === "done") return { label: "done", tone: "done", color: "\x1b[32m" };
  if (e.status === "expired") return { label: "expired", tone: "expired", color: "\x1b[31m" };
  const days = e.daysLeft;
  if (e.kind === "quiz") return { label: "quiz", tone: "plain", color: "\x1b[37m" };
  if (days == null) return { label: "open", tone: "open", color: "\x1b[2m" };
  if (days <= 0) return { label: "due today", tone: "due", color: "\x1b[31m" };
  if (days === 1) return { label: "due tomorrow", tone: "due", color: "\x1b[31m" };
  if (days <= 3) return { label: `in ${days}d`, tone: "soon", color: "\x1b[33m" };
  return { label: `in ${days}d`, tone: "open", color: "\x1b[32m" };
}

export function deadlineText(deadlineAt: string | null): string {
  return deadlineAt ? deadlineAt.slice(0, 16).replace("T", " ") : "";
}

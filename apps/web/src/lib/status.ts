import type { Exercise } from "../types";

export type Tone = "ok" | "late" | "soon" | "coming" | "none";

export interface DeadlineInfo {
  label: string;
  tone: Tone;
}

export function deadlineInfo(e: Pick<Exercise, "done" | "status" | "daysLeft">): DeadlineInfo {
  if (e.done) return { label: "Concluída", tone: "ok" };
  if (e.status === "expired") {
    const n = e.daysLeft == null ? 0 : Math.abs(e.daysLeft);
    return { label: n === 0 ? "Atrasada" : `Atrasada ${n}d`, tone: "late" };
  }
  if (e.daysLeft == null) return { label: "Sem prazo", tone: "none" };
  if (e.daysLeft <= 1) {
    return { label: e.daysLeft === 0 ? "Vence hoje" : "Vence amanhã", tone: "soon" };
  }
  if (e.daysLeft <= 3) return { label: `Vence em ${e.daysLeft}d`, tone: "soon" };
  return { label: `Vence em ${e.daysLeft}d`, tone: "coming" };
}

/** Tailwind classes per tone (colored text on a soft tinted pill). */
export const TONE_CLS: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok border-ok/30",
  late: "bg-late-bg text-late border-late/30",
  soon: "bg-soon-bg text-soon border-soon/30",
  coming: "bg-coming-bg text-coming border-coming/30",
  none: "bg-none-bg text-none border-none/30",
};

export function countInfo(items: { status: Exercise["status"] }[]): { open: number; expired: number; done: number } {
  return {
    open: items.filter((i) => i.status === "open").length,
    expired: items.filter((i) => i.status === "expired").length,
    done: items.filter((i) => i.status === "done").length,
  };
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function fmtDeadline(iso: string): string {
  const d = new Date(iso);
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

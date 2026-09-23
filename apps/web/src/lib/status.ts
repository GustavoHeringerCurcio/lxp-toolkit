import type { Exercise } from "../types";
import type { TranslateFn } from "./i18n";

export type Tone = "ok" | "late" | "soon" | "coming" | "none";

export interface DeadlineInfo {
  label: string;
  tone: Tone;
}

export function deadlineInfo(
  e: Pick<Exercise, "done" | "status" | "daysLeft">,
  t: TranslateFn,
): DeadlineInfo {
  if (e.done) return { label: t("status.done"), tone: "ok" };
  if (e.status === "expired") {
    const n = e.daysLeft == null ? 0 : Math.abs(e.daysLeft);
    return { label: n === 0 ? t("status.late") : t("status.lateDays", { n }), tone: "late" };
  }
  if (e.daysLeft == null) return { label: t("status.noDeadline"), tone: "none" };
  if (e.daysLeft <= 1) {
    return { label: e.daysLeft === 0 ? t("status.dueToday") : t("status.dueTomorrow"), tone: "soon" };
  }
  if (e.daysLeft <= 3) return { label: t("status.dueIn", { n: e.daysLeft }), tone: "soon" };
  return { label: t("status.dueIn", { n: e.daysLeft }), tone: "coming" };
}

/** Tailwind classes per tone (colored text on a soft tinted pill). */
export const TONE_CLS: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok border-ok/30",
  late: "bg-late-bg text-late border-late/30",
  soon: "bg-soon-bg text-soon border-soon/30",
  coming: "bg-coming-bg text-coming border-coming/30",
  none: "bg-none-bg text-none border-none/30",
};

/** Parse a portal deadline ("YYYY-MM-DD HH:MM:SS", local wall-clock) to a timestamp. */
export function parseDeadlineTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso.replace(" ", "T")).getTime();
  return Number.isNaN(t) ? null : t;
}

/** True only for deadlines still in the future (expired items are not "upcoming"). */
export function isUpcoming(deadlineAt: string | null | undefined, now = Date.now()): boolean {
  const ts = parseDeadlineTs(deadlineAt);
  return ts != null && ts >= now;
}

/** God's Eye deadline label: past deadlines are "overdue", never "due in 0d". */
export function godsEyeDeadlineLabel(
  deadlineAt: string | null | undefined,
  now: number,
  t: TranslateFn,
  locale: string,
): string {
  const ts = parseDeadlineTs(deadlineAt);
  if (ts == null) return t("godsEye.noDeadline");
  const date = new Date(ts).toLocaleDateString(locale, { day: "2-digit", month: "short" });
  if (ts < now) return `${t("godsEye.overdue")} · ${date}`;
  const days = Math.ceil((ts - now) / 86_400_000);
  if (days <= 14) return `${t("godsEye.dueIn", { days })} · ${date}`;
  return date;
}

export function countInfo(items: { status: Exercise["status"] }[]): { open: number; expired: number; done: number } {
  return {
    open: items.filter((i) => i.status === "open").length,
    expired: items.filter((i) => i.status === "expired").length,
    done: items.filter((i) => i.status === "done").length,
  };
}

/** Open first, then by days left, then alphabetical — the canonical "what to do next" order. */
export function cmpOpen(
  a: { status: string; daysLeft: number | null; title: string },
  b: { status: string; daysLeft: number | null; title: string },
  locale = "pt-BR",
): number {
  const rank = (s: string): number => (s === "open" ? 0 : s === "expired" ? 1 : 2);
  const r = rank(a.status) - rank(b.status);
  if (r) return r;
  const da = a.daysLeft ?? Infinity;
  const db = b.daysLeft ?? Infinity;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title, locale);
}

/** Live countdown parts for a deadline ("3d 04h", past-aware). */
export function countdownParts(iso: string, now = Date.now()): { rel: string; past: boolean } {
  const t = new Date(iso).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const rel = d >= 1 ? `${d}d ${String(h).padStart(2, "0")}h` : h >= 1 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
  return { rel, past: diff < 0 };
}

const fmtCache = new Map<string, { dateFmt: Intl.DateTimeFormat; timeFmt: Intl.DateTimeFormat }>();

function formattersFor(locale: string) {
  let f = fmtCache.get(locale);
  if (!f) {
    f = {
      dateFmt: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }),
      timeFmt: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
    };
    fmtCache.set(locale, f);
  }
  return f;
}

export function fmtDeadline(iso: string, locale = "pt-BR"): string {
  const d = new Date(iso);
  const { dateFmt, timeFmt } = formattersFor(locale);
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

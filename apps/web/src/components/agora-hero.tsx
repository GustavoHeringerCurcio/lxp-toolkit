import { useEffect, useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/lib/use-local-storage";
import type { Exercise } from "@/types";
import { countdownParts, fmtDeadline } from "@/lib/status";
import { contentLabel } from "@/lib/kind";
import { useT, type TranslateFn } from "@/lib/i18n";
import { StatusBadge, TypeBadge } from "./status-badges";

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function heroMeta(next: Exercise, t: TranslateFn, tn: (key: string, n: number) => string): string {
  const fileCount = next.remoteFiles.length || next.files.length;
  return next.kind === "quiz" && next.questions.length
    ? tn("plural.questions", next.questions.length)
    : next.kind === "upload" && fileCount
      ? tn("plural.files", fileCount)
      : next.kind === "forum" && next.forum
        ? t("forum.count", { n: next.forum.countPosts })
        : next.kind === "mark" || next.kind === "other"
          ? contentLabel(next.contentKind, t)
          : "";
}

/** The "next up" hero: what to do next, with a live mono countdown. */
export function NextHero({ next, onClick }: { next: Exercise; onClick: () => void }) {
  const now = useNow();
  const { t, tn, locale } = useT();
  const cd = next.deadlineAt ? countdownParts(next.deadlineAt, now) : null;
  const meta = heroMeta(next, t, tn);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-4 rounded-xl border border-primary/25 bg-card p-5 text-left",
        "transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
        <Target className="size-5" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-widest text-brand">{t("hero.next")}</span>
        <span className="mt-0.5 block truncate font-heading text-lg font-semibold leading-snug tracking-tight">
          {next.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <TypeBadge kind={next.kind} contentKind={next.contentKind} isSurvey={next.isSurvey} />
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {next.deadlineAt && cd ? (
          <>
            <span className="font-mono text-xl font-medium tabular-nums text-foreground">
              {cd.past ? t("hero.late") : cd.rel}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {cd.past ? t("hero.overdueBy", { t: cd.rel }) : fmtDeadline(next.deadlineAt, locale)}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{t("hero.noDeadline")}</span>
        )}
        <StatusBadge e={next} />
      </span>
    </button>
  );
}

/** Overall completion ring (done / total). */
export function ProgressRing({
  done,
  total,
  size = 84,
  ariaLabel,
}: {
  done: number;
  total: number;
  size?: number;
  ariaLabel?: string;
}) {
  const pct = total === 0 ? 0 : done / total;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="stroke-ok transition-[stroke-dashoffset] duration-700 ease-soft"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <span className="font-heading text-lg font-semibold tabular-nums">
          {total === 0 ? "—" : `${Math.round(pct * 100)}%`}
        </span>
      </div>
    </div>
  );
}

export interface ModuleProgress {
  name: string;
  done: number;
  open: number;
  late: number;
  total: number;
}

export interface ProgressTotals {
  done: number;
  late: number;
  open: number;
  total: number;
}

/**
 * Overall progress in a single merged bar, with a disclosure that expands to
 * the per-module breakdown. The open state persists across visits.
 */
export function ProgressSummary({
  modules,
  totals,
  onSelect,
}: {
  modules: ModuleProgress[];
  totals: ProgressTotals;
  onSelect?: (name: string) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useLocalStorage("lxp.agora.progress.modules", false);
  const { done, late, open: openCount, total } = totals;
  const pct = (n: number) => `${(n / Math.max(total, 1)) * 100}%`;
  const pctLabel = total === 0 ? 0 : Math.round((done / total) * 100);

  const legend = [
    { key: "done", label: t("progress.legendDone"), value: done, cls: "bg-ok" },
    { key: "late", label: t("progress.legendLate"), value: late, cls: "bg-late" },
    { key: "open", label: t("progress.legendOpen"), value: openCount, cls: "bg-coming" },
  ] as const;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="agora-progress-modules"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <h2 className="shrink-0 font-heading text-sm font-semibold">{t("now.progress")}</h2>
          <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="bg-ok" style={{ width: pct(done) }} />
            <span className="bg-late" style={{ width: pct(late) }} />
            <span className="bg-coming" style={{ width: pct(openCount) }} />
          </span>
          <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:inline">
            {done}/{total} · {pctLabel}%
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-soft", !open && "-rotate-90")}
            aria-hidden
          />
        </button>
        <ProgressRing done={done} total={total} size={48} ariaLabel={t("now.ringAria", { done, total })} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", l.cls)} aria-hidden />
            <span className="font-mono tabular-nums">{l.value}</span>
            {l.label}
          </span>
        ))}
      </div>

      {open && (
        <div id="agora-progress-modules" className="mt-4 space-y-3 border-t border-border/60 pt-4">
          {modules.map((m) => {
            const mp = (n: number) => `${(n / Math.max(m.total, 1)) * 100}%`;
            const body = (
              <>
                <span className="w-32 shrink-0 truncate text-[13px] text-muted-foreground sm:w-44">
                  {m.name}
                </span>
                <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="bg-ok" style={{ width: mp(m.done) }} />
                  <span className="bg-late" style={{ width: mp(m.late) }} />
                  <span className="bg-coming" style={{ width: mp(m.open) }} />
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {m.done}/{m.total}
                </span>
              </>
            );
            return onSelect ? (
              <button
                key={m.name}
                type="button"
                onClick={() => onSelect(m.name)}
                className="group flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </button>
            ) : (
              <div key={m.name} className="flex items-center gap-3">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

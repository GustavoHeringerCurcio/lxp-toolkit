import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { countdownParts, fmtDeadline } from "@/lib/status";
import { CONTENT_LABEL } from "@/lib/kind";
import { StatusBadge, TypeBadge } from "./status-badges";

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function heroMeta(next: Exercise): string {
  const fileCount = next.remoteFiles.length || next.files.length;
  return next.kind === "quiz" && next.questions.length
    ? `${next.questions.length} questão${next.questions.length > 1 ? "es" : ""}`
    : next.kind === "upload" && fileCount
      ? `${fileCount} arquivo${fileCount > 1 ? "s" : ""}`
      : next.kind === "mark" || next.kind === "other"
        ? CONTENT_LABEL[next.contentKind]
        : "";
}

/** The "next up" hero: what to do next, with a live mono countdown. */
export function NextHero({ next, onClick }: { next: Exercise; onClick: () => void }) {
  const now = useNow();
  const cd = next.deadlineAt ? countdownParts(next.deadlineAt, now) : null;
  const meta = heroMeta(next);

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
        <span className="block text-[11px] font-semibold uppercase tracking-widest text-brand">Próxima</span>
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
              {cd.past ? "atrasada" : cd.rel}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {cd.past ? `venceu há ${cd.rel}` : fmtDeadline(next.deadlineAt)}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">sem prazo</span>
        )}
        <StatusBadge e={next} />
      </span>
    </button>
  );
}

/** Overall completion ring (done / total). */
export function ProgressRing({ done, total, size = 84 }: { done: number; total: number; size?: number }) {
  const pct = total === 0 ? 0 : done / total;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
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
      <div className="absolute inset-0 grid place-items-center">
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

/** Stacked done/late/open bars per module. */
export function ModuleMiniBars({
  modules,
  onSelect,
}: {
  modules: ModuleProgress[];
  onSelect?: (name: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Módulos</h2>
        <span className="text-[11px] text-muted-foreground">concluídas / total</span>
      </div>
      <div className="space-y-3">
        {modules.map((m) => {
          const pct = (n: number) => `${(n / Math.max(m.total, 1)) * 100}%`;
          const body = (
            <>
              <span className="w-32 shrink-0 truncate text-[13px] text-muted-foreground sm:w-44 sm:text-muted-foreground/90">
                {m.name}
              </span>
              <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="bg-ok" style={{ width: pct(m.done) }} />
                <span className="bg-late" style={{ width: pct(m.late) }} />
                <span className="bg-coming" style={{ width: pct(m.open) }} />
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
    </div>
  );
}

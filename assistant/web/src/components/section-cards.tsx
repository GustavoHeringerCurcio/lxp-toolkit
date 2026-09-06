import { AlertTriangle, Check, Clock3, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { Exercise } from "@/types";
import { fmtDeadline } from "@/lib/status";
import { StatusBadge, TypeBadge } from "./status-badges";

export type KpiKey = "open" | "expired" | "done";

const KPIS: { key: KpiKey; label: string; icon: LucideIcon; tint: string }[] = [
  { key: "open", label: "Abertas", icon: Clock3, tint: "text-coming bg-coming/15" },
  { key: "expired", label: "Atrasadas", icon: AlertTriangle, tint: "text-late bg-late/15" },
  { key: "done", label: "Concluídas", icon: Check, tint: "text-ok bg-ok/15" },
];

export function StatCards({
  counts,
  active,
  onSelect,
}: {
  counts: { open: number; expired: number; done: number };
  active: KpiKey | null;
  onSelect: (k: KpiKey) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {KPIS.map((s) => {
        const isActive = active === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors",
              "hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "border-primary/60 ring-1 ring-primary/25" : "border-border",
            )}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", s.tint)}>
              <s.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-2xl font-bold leading-none tabular-nums">{counts[s.key]}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{s.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NextCard({ next }: { next: Exercise | null }) {
  if (!next) return null;
  const meta =
    next.kind === "quiz"
      ? next.questions.length
        ? `${next.questions.length} questão${next.questions.length > 1 ? "es" : ""}`
        : ""
      : next.files.length
        ? `${next.files.length} arquivo${next.files.length > 1 ? "s" : ""}`
        : "";
  return (
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Target className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand font-heading">Próxima</div>
          <div className="truncate font-heading text-base font-semibold leading-snug">{next.title}</div>
          {meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge e={next} />
          {next.deadlineAt && <span className="text-[11px] tabular-nums text-muted-foreground">{fmtDeadline(next.deadlineAt)}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

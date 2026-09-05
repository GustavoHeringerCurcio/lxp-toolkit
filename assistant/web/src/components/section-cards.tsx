import { Card, CardContent } from "@/components/ui/card";
import type { Exercise } from "@/types";
import { StatusBadge, TypeBadge } from "./status-badges";

export function NextCard({ next }: { next: Exercise | null }) {
  if (!next) return null;
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/15 to-transparent">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-lg text-primary-foreground">
          🎯
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Próxima</div>
          <div className="truncate font-semibold">{next.title}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge e={next} />
          <span className="text-[11px] text-muted-foreground">{next.deadlineAt?.slice(0, 16) ?? "sem prazo"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCards({ counts }: { counts: { open: number; expired: number; done: number } }) {
  const items = [
    { label: "Abertas", value: counts.open, dot: "bg-ok" },
    { label: "Atrasadas", value: counts.expired, dot: "bg-late" },
    { label: "Concluídas", value: counts.done, dot: "bg-none" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((s) => (
        <Card key={s.label}>
          <CardContent className="flex items-center gap-3 p-3.5">
            <span className={`size-2.5 rounded-full ${s.dot}`} />
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-none tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

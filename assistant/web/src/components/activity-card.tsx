import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { AccChips } from "./prof-chip";
import { StatusBadge, TypeBadge } from "./status-badges";

export function ActivityCard({ e, selected, onClick }: { e: Exercise; selected: boolean; onClick: () => void }) {
  const meta = e.kind === "quiz" ? (e.questions.length ? `${e.questions.length} questões` : "") : e.files.length ? `${e.files.length} arquivo${e.files.length > 1 ? "s" : ""}` : "";
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg border bg-card px-3.5 py-3 text-left transition-colors",
        "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary/60 ring-1 ring-primary/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("truncate text-sm font-medium", e.done && "text-muted-foreground line-through")}>
            {e.title}
          </div>
          <AccChips professor={e.professor} moduleName={e.moduleName} className="mt-1.5" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <TypeBadge kind={e.kind} />
            <StatusBadge e={e} />
          </div>
          {meta && <span className="text-[11px] text-muted-foreground">{meta}</span>}
        </div>
      </div>
    </button>
  );
}

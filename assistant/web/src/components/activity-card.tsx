import { ListChecks, Paperclip, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { fmtDeadline } from "@/lib/status";
import { AccChips } from "./prof-chip";
import { StatusBadge } from "./status-badges";

export function ActivityCard({ e, selected, onClick }: { e: Exercise; selected: boolean; onClick: () => void }) {
  const quiz = e.kind === "quiz";
  const meta =
    quiz && e.questions.length
      ? `${e.questions.length} questão${e.questions.length > 1 ? "es" : ""}`
      : !quiz && e.files.length
        ? `${e.files.length} arquivo${e.files.length > 1 ? "s" : ""}`
        : "";
  const lateish = !e.done && e.status === "expired";
  const dateTone = lateish ? "text-late" : !e.done && e.daysLeft != null && e.daysLeft <= 3 ? "text-soon" : "text-muted-foreground";

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={e.title}
      className={cn(
        "flex w-full items-stretch gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors",
        "hover:border-primary/30 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/25" : "border-border",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 self-center place-items-center rounded-lg",
          quiz ? "bg-teal/15 text-teal" : "bg-brand/15 text-brand",
        )}
        aria-hidden
      >
        {quiz ? <ListChecks className="size-4" /> : <Upload className="size-4" />}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={cn("truncate text-sm font-medium", e.done && "text-muted-foreground line-through")}>{e.title}</span>
        <AccChips professor={e.professor} moduleName={e.moduleName} />
        {meta && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {!quiz && <Paperclip className="size-3" aria-hidden />}
            {meta}
          </span>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end justify-center gap-1.5">
        <StatusBadge e={e} />
        {e.deadlineAt && (
          <span className={cn("whitespace-nowrap text-[11px] tabular-nums", dateTone)}>{fmtDeadline(e.deadlineAt)}</span>
        )}
      </span>
    </button>
  );
}

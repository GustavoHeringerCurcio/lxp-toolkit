import { ListChecks, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { deadlineInfo, TONE_CLS } from "@/lib/status";

export function TypeBadge({ kind, className }: { kind: Exercise["kind"]; className?: string }) {
  const quiz = kind === "quiz";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        quiz ? "border-teal/25 bg-teal/10 text-teal" : "border-border bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      {quiz ? <ListChecks className="size-3" /> : <Upload className="size-3" />}
      {quiz ? "Quiz" : "Tarefa"}
    </span>
  );
}

export function StatusBadge({ e, className }: { e: Pick<Exercise, "done" | "status" | "daysLeft">; className?: string }) {
  const d = deadlineInfo(e);
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        TONE_CLS[d.tone],
        className,
      )}
    >
      {d.label}
    </span>
  );
}

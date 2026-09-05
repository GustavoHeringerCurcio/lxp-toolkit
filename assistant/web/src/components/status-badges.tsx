import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { deadlineInfo, TONE_CLS } from "@/lib/status";

export function TypeBadge({ kind, className }: { kind: Exercise["kind"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        kind === "quiz"
          ? "border-violet-400/20 bg-violet-500/15 text-violet-300"
          : "border-sky-400/20 bg-sky-500/15 text-sky-300",
        className,
      )}
    >
      {kind === "quiz" ? "❓ Quiz" : "📤 Tarefa"}
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

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { accentFor, professorLabel } from "@/lib/prof";

/** Colored professor + module chips (same accent). Inline var keeps Tailwind scanning clean. */
export function AccChips({
  professorId,
  professor,
  moduleName,
  className,
}: {
  professorId: number | null;
  professor: string | null;
  moduleName: string;
  className?: string;
}) {
  const acc = accentFor(professorId, professor);
  const style = { "--acc": acc } as CSSProperties;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)} style={style}>
      {professor && (
        <span className="acc-chip">
          <span className="acc-dot" />
          {professorLabel(professor)}
        </span>
      )}
      <span className="acc-chip">{moduleName}</span>
    </span>
  );
}

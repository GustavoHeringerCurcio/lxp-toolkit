import { cn } from "@/lib/utils";
import type { ExerciseKind } from "@/types";
import { kindMeta } from "@/lib/kind";
import { subjectInitials, subjectStyle } from "@/lib/subject";
import { professorInitials, professorLabel } from "@/lib/prof";

/**
 * Identity primitives for cards and headers.
 *
 * - `SubjectAvatar` — the only per-card color: a monogram keyed to the module,
 *   with an optional type icon as a corner badge (type stays monochrome).
 * - `SubjectLabel` — the module name in the subject color.
 * - `ProfessorTag` — neutral initials avatar + name (professors never own color).
 */

export function SubjectAvatar({
  moduleName,
  kind,
  className,
}: {
  moduleName: string;
  kind?: ExerciseKind;
  className?: string;
}) {
  const Icon = kind ? kindMeta(kind).icon : null;
  return (
    <span
      aria-hidden
      style={subjectStyle(moduleName)}
      className={cn(
        "subject-avatar relative grid size-9 shrink-0 place-items-center rounded-lg font-heading text-[13px] font-semibold",
        className,
      )}
    >
      {subjectInitials(moduleName)}
      {Icon && (
        <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-md border border-border bg-card text-muted-foreground">
          <Icon className="size-2.5" />
        </span>
      )}
    </span>
  );
}

export function SubjectLabel({ moduleName, className }: { moduleName: string; className?: string }) {
  return (
    <span
      style={subjectStyle(moduleName)}
      className={cn("subject-text truncate text-[11px] font-semibold", className)}
    >
      {moduleName}
    </span>
  );
}

export function ProfessorTag({ name, className }: { name: string | null; className?: string }) {
  if (!name) return null;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="grid size-4 shrink-0 place-items-center rounded-full border border-border bg-muted/60 text-[8px] font-semibold uppercase text-muted-foreground"
      >
        {professorInitials(name)}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{professorLabel(name)}</span>
    </span>
  );
}

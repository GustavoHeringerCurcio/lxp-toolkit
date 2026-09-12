import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ExerciseKind } from "@/types";
import { kindMeta } from "@/lib/kind";
import { subjectInitials, subjectStyle } from "@/lib/subject";
import { subjectIcon } from "@/lib/subject-icon";
import { professorInitials, professorLabel } from "@/lib/prof";

/**
 * Identity primitives for cards and headers.
 *
 * - `SubjectAvatar` — the only per-card color: a domain icon keyed to the module
 *   (falling back to a monogram), with an optional type icon as a corner badge
 *   (type stays monochrome). An optional `imageUrl` (the professor's photo)
 *   overrides the icon while keeping the subject-colored frame.
 * - `SubjectLabel` — the module name in the subject color.
 * - `ProfessorTag` — neutral initials avatar (or photo) + name.
 */

export function SubjectAvatar({
  moduleName,
  kind,
  imageUrl,
  imageAlt,
  iconClassName,
  className,
}: {
  moduleName: string;
  kind?: ExerciseKind;
  /** Optional override (e.g. the professor's photo) shown instead of the icon. */
  imageUrl?: string | null;
  imageAlt?: string;
  /** Size of the domain icon when no image is set (defaults to `size-4`). */
  iconClassName?: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const Icon = kind ? kindMeta(kind).icon : null;
  const DomainIcon = subjectIcon(moduleName);
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  return (
    <span
      aria-hidden
      style={subjectStyle(moduleName)}
      className={cn(
        "subject-avatar relative grid size-9 shrink-0 place-items-center rounded-lg font-heading text-[13px] font-semibold",
        className,
      )}
    >
      {showImage ? (
        <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
          <img
            src={imageUrl ?? undefined}
            alt={imageAlt ?? ""}
            loading="lazy"
            onError={() => setFailedUrl(imageUrl ?? null)}
            className="size-full object-cover"
          />
        </span>
      ) : DomainIcon ? (
        <DomainIcon className={cn(iconClassName ?? "size-4")} aria-hidden />
      ) : (
        subjectInitials(moduleName)
      )}
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

export function ProfessorTag({
  name,
  imageUrl,
  className,
}: {
  name: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!name) return null;
  const showImage = Boolean(imageUrl) && !failed;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="grid size-4 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted/60 text-[8px] font-semibold uppercase text-muted-foreground"
      >
        {showImage ? (
          <img
            src={imageUrl ?? undefined}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          professorInitials(name)
        )}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{professorLabel(name)}</span>
    </span>
  );
}

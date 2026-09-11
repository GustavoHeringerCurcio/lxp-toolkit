import { CalendarClock, CheckCircle2, CircleAlert, Clock3, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { deadlineInfo, TONE_CLS, type Tone } from "@/lib/status";
import { CONTENT_LABEL, kindMeta } from "@/lib/kind";

export function TypeBadge({
  kind,
  contentKind,
  className,
}: {
  kind: Exercise["kind"];
  contentKind?: Exercise["contentKind"];
  className?: string;
}) {
  const meta = kindMeta(kind);
  const Icon = meta.icon;
  const title = contentKind ? `${meta.label} · ${CONTENT_LABEL[contentKind]}` : meta.label;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        meta.badgeClass,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {meta.short}
    </span>
  );
}

const TONE_ICON: Record<Tone, LucideIcon> = {
  ok: CheckCircle2,
  late: CircleAlert,
  soon: Clock3,
  coming: CalendarClock,
  none: Minus,
};

export function StatusBadge({ e, className }: { e: Pick<Exercise, "done" | "status" | "daysLeft">; className?: string }) {
  const d = deadlineInfo(e);
  const Icon = TONE_ICON[d.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        TONE_CLS[d.tone],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {d.label}
    </span>
  );
}

/** Prominent green "Feito" pill shown on completed activities. */
export function DoneBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-ok/30 bg-ok-bg px-2.5 py-0.5 text-[11px] font-semibold text-ok",
        className,
      )}
    >
      <CheckCircle2 className="size-3" aria-hidden />
      Feito
    </span>
  );
}

import { CalendarClock, CheckCircle2, CircleAlert, Clock3, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise, UploadFlavor } from "@/types";
import { deadlineInfo, TONE_CLS, type Tone } from "@/lib/status";
import { contentLabel, flavorMeta, kindLabel, kindMeta, kindShort } from "@/lib/kind";
import { useT } from "@/lib/i18n";

export function TypeBadge({
  kind,
  contentKind,
  isSurvey,
  className,
}: {
  kind: Exercise["kind"];
  contentKind?: Exercise["contentKind"];
  isSurvey?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const meta = kindMeta(kind);
  const Icon = meta.icon;
  const label = isSurvey ? t("badge.survey") : kindShort(kind, t);
  const title = isSurvey
    ? t("badge.surveyTitle")
    : contentKind
      ? `${kindLabel(kind, t)} · ${contentLabel(contentKind, t)}`
      : kindLabel(kind, t);
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
      {label}
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
  const { t } = useT();
  const d = deadlineInfo(e, t);
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

/** Prominent green "done" pill shown on completed activities. */
export function DoneBadge({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-ok/30 bg-ok-bg px-2.5 py-0.5 text-[11px] font-semibold text-ok",
        className,
      )}
    >
      <CheckCircle2 className="size-3" aria-hidden />
      {t("badge.done")}
    </span>
  );
}

/**
 * Badge for the anomaly flavors (ghost/print). Renders nothing for the normal
 * `question` flavor, so ordinary tasks stay uncluttered.
 */
export function FlavorBadge({
  flavor,
  source,
  className,
}: {
  flavor: UploadFlavor;
  source?: Exercise["flavorSource"];
  className?: string;
}) {
  const { t } = useT();
  if (!flavor || flavor === "question") return null;
  const meta = flavorMeta(flavor);
  const Icon = meta.icon;
  return (
    <span
      title={source === "manual" ? t("flavor.tagged") : t("flavor.detected")}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        meta.badgeClass,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {t(`flavor.${flavor}`)}
    </span>
  );
}

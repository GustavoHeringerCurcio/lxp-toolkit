import { CalendarClock, CheckCircle2, CircleAlert, Clock3, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";
import { deadlineInfo, TONE_CLS, type Tone } from "@/lib/status";
import { activityBadge, BADGE_TONE_CLS } from "@/lib/kind";
import { useT } from "@/lib/i18n";

/**
 * Always-on activity badge: type + answerability state ("Tarefa · Sem pergunta",
 * "Quiz · Sem perguntas", "Leitura"). Anomalies render as **outline** chips
 * (red = error, amber = warn); normal items stay monochrome. Because it is never
 * filled, it does not compete with the filled status pill (DESIGN.md §3.5).
 */
export function ActivityBadge({
  e,
  className,
}: {
  e: Pick<Exercise, "kind" | "contentKind" | "isSurvey" | "anomalies">;
  className?: string;
}) {
  const { t } = useT();
  const info = activityBadge(e);
  const Icon = info.icon;
  const label = info.stateKey ? `${t(info.typeKey)} · ${t(info.stateKey)}` : t(info.typeKey);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        BADGE_TONE_CLS[info.tone],
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

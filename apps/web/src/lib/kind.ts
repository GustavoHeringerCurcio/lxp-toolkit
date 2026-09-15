import {
  CircleCheckBig,
  ListChecks,
  MessagesSquare,
  Upload,
  FileQuestion,
  type LucideIcon,
} from "lucide-react";
import type { Anomaly, AnomalySeverity, ContentKind, ExerciseKind, UploadFlavor } from "@/types";
import type { TranslateFn } from "./i18n";

export interface KindMeta {
  /** Full label, used on the detail page. */
  label: string;
  /** Compact label, used on badges/chips. */
  short: string;
  icon: LucideIcon;
  /** Badge pill classes (monochrome — the icon differentiates the type). */
  badgeClass: string;
  /** Card icon-tile classes (monochrome). */
  tileClass: string;
  /** Whether the AI answer workbench applies. */
  canAnswer: boolean;
  /** Whether the portal "mark as completed" action applies. */
  canMark: boolean;
}

/**
 * Type is encoded by **icon + label**, never by color: status owns semantic
 * color and subject owns identity color, so type stays monochrome to avoid
 * collisions (DESIGN.md §3.5).
 */
const NEUTRAL_BADGE = "border-border bg-muted/40 text-muted-foreground";
const NEUTRAL_TILE = "bg-muted/50 text-muted-foreground";

export const KIND_META: Record<ExerciseKind, KindMeta> = {
  quiz: {
    label: "Quiz",
    short: "Quiz",
    icon: ListChecks,
    badgeClass: NEUTRAL_BADGE,
    tileClass: NEUTRAL_TILE,
    canAnswer: true,
    canMark: false,
  },
  upload: {
    label: "Tarefa (envio de arquivo)",
    short: "Tarefa",
    icon: Upload,
    badgeClass: NEUTRAL_BADGE,
    tileClass: NEUTRAL_TILE,
    canAnswer: true,
    canMark: false,
  },
  mark: {
    label: "Marcar como concluída",
    short: "Marcar",
    icon: CircleCheckBig,
    badgeClass: NEUTRAL_BADGE,
    tileClass: NEUTRAL_TILE,
    canAnswer: false,
    canMark: true,
  },
  forum: {
    label: "Fórum",
    short: "Fórum",
    icon: MessagesSquare,
    badgeClass: NEUTRAL_BADGE,
    tileClass: NEUTRAL_TILE,
    canAnswer: true,
    canMark: false,
  },
  other: {
    label: "Outro",
    short: "Outro",
    icon: FileQuestion,
    badgeClass: NEUTRAL_BADGE,
    tileClass: NEUTRAL_TILE,
    canAnswer: false,
    canMark: false,
  },
};

export const KIND_ORDER: ExerciseKind[] = ["quiz", "upload", "forum", "mark", "other"];

/** Finer label for the raw content classification. */
export const CONTENT_LABEL: Record<ContentKind, string> = {
  pdf: "PDF",
  reading: "Leitura",
  link: "Link",
  forum: "Fórum",
  other: "Conteúdo",
  quiz: "Quiz",
  file_upload: "Tarefa",
};

export function kindMeta(kind: ExerciseKind): KindMeta {
  return KIND_META[kind];
}

// ── Task flavor (what the task actually requires) ───────────────────────────

/** Whether the AI generate workbench applies: only real-question items. */
export function canAiAnswer(e: {
  kind: ExerciseKind;
  flavor: UploadFlavor;
}): boolean {
  return (e.kind === "upload" || e.kind === "quiz" || e.kind === "forum") && e.flavor === "question";
}

// ── Combined activity badge (type · answerability state) ────────────────────

export type BadgeTone = "none" | AnomalySeverity;

export interface ActivityBadgeInfo {
  /** i18n key for the type portion ("Quiz", "Tarefa", "Leitura", …). */
  typeKey: string;
  /** i18n key for the state portion, or null when the kind has no state. */
  stateKey: string | null;
  tone: BadgeTone;
  icon: LucideIcon;
}

/**
 * Compose the always-on activity badge: type + answerability state for
 * quiz/upload, type only for everything else. The tone is `error`/`warn` only
 * when the item carries an anomaly (rendered as an outline chip).
 */
export function activityBadge(e: {
  kind: ExerciseKind;
  contentKind: ContentKind;
  isSurvey: boolean;
  anomalies: Anomaly[];
}): ActivityBadgeInfo {
  const icon = kindMeta(e.kind).icon;
  if (e.isSurvey) return { typeKey: "badge.survey", stateKey: null, tone: "none", icon };

  const typeKey =
    e.kind === "mark" || e.kind === "other" ? `content.${e.contentKind}` : `kind.${e.kind}.short`;
  if (e.kind !== "quiz" && e.kind !== "upload") {
    return { typeKey, stateKey: null, tone: "none", icon };
  }

  const primary = e.anomalies[0];
  if (primary?.code === "ghost") {
    return {
      typeKey,
      stateKey: e.kind === "quiz" ? "badgeState.ghostQuiz" : "badgeState.ghostTask",
      tone: primary.severity,
      icon,
    };
  }
  if (primary?.code === "print") {
    return { typeKey, stateKey: "badgeState.print", tone: primary.severity, icon };
  }
  return {
    typeKey,
    stateKey: e.kind === "quiz" ? "badgeState.questionQuiz" : "badgeState.questionTask",
    tone: "none",
    icon,
  };
}

/** Tailwind classes per badge tone: anomalies are outline-only (never filled). */
export const BADGE_TONE_CLS: Record<BadgeTone, string> = {
  none: NEUTRAL_BADGE,
  error: "border-late/50 bg-transparent text-late",
  warn: "border-soon/50 bg-transparent text-soon",
};

/**
 * UI labels come from the dictionaries so they follow the active language.
 * `KIND_META.label` stays in PT on purpose: it feeds the AI prompt payload,
 * which must keep matching `apps/server/src/prompt.ts`.
 */
export function kindLabel(kind: ExerciseKind, t: TranslateFn): string {
  return t(`kind.${kind}.label`);
}

export function kindShort(kind: ExerciseKind, t: TranslateFn): string {
  return t(`kind.${kind}.short`);
}

export function contentLabel(kind: ContentKind, t: TranslateFn): string {
  return t(`content.${kind}`);
}

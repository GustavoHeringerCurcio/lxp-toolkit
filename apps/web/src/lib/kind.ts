import { CircleCheckBig, ListChecks, MessagesSquare, Upload, type LucideIcon } from "lucide-react";
import type { ContentKind, ExerciseKind } from "@/types";
import type { TranslateFn } from "./i18n";

export interface KindMeta {
  /** Full label, used on the detail page. */
  label: string;
  /** Compact label, used on badges/chips. */
  short: string;
  icon: LucideIcon;
  /** Badge pill classes. */
  badgeClass: string;
  /** Card icon-tile classes. */
  tileClass: string;
  /** Whether the AI answer workbench applies. */
  canAnswer: boolean;
  /** Whether the portal "mark as completed" action applies. */
  canMark: boolean;
}

export const KIND_META: Record<ExerciseKind, KindMeta> = {
  quiz: {
    label: "Quiz",
    short: "Quiz",
    icon: ListChecks,
    badgeClass: "border-info/25 bg-info/10 text-info",
    tileClass: "bg-info/15 text-info",
    canAnswer: true,
    canMark: false,
  },
  upload: {
    label: "Tarefa (envio de arquivo)",
    short: "Tarefa",
    icon: Upload,
    badgeClass: "border-brand/25 bg-brand/10 text-brand",
    tileClass: "bg-brand/15 text-brand",
    canAnswer: true,
    canMark: false,
  },
  mark: {
    label: "Marcar como concluída",
    short: "Marcar",
    icon: CircleCheckBig,
    badgeClass: "border-ok/30 bg-ok-bg text-ok",
    tileClass: "bg-ok/15 text-ok",
    canAnswer: false,
    canMark: true,
  },
  other: {
    label: "Outro",
    short: "Outro",
    icon: MessagesSquare,
    badgeClass: "border-border bg-muted/50 text-muted-foreground",
    tileClass: "bg-muted/50 text-muted-foreground",
    canAnswer: false,
    canMark: false,
  },
};

export const KIND_ORDER: ExerciseKind[] = ["quiz", "upload", "mark", "other"];

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

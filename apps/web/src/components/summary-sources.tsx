import { FileQuestion, type LucideIcon } from "lucide-react";
import type { ContentKind, SummaryItem } from "@/types";
import { CONTENT_ICON } from "@/lib/kind";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function iconFor(kind: string): LucideIcon {
  return CONTENT_ICON[kind as ContentKind] ?? FileQuestion;
}

function labelFor(kind: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return t(`content.${kind}`);
}

/** Compact "N PDF · N leituras · N quizzes" breakdown chip line. */
export function SummarySourcesBreakdown({ items, className }: { items: SummaryItem[]; className?: string }) {
  const { t } = useT();
  if (items.length === 0) return null;
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {[...counts.entries()].map(([kind, n]) => {
        const Icon = iconFor(kind);
        return (
          <span key={kind} className="flex items-center gap-1">
            <Icon className="size-3" aria-hidden />
            <span className="font-mono tabular-nums">{n}</span>
            <span>{labelFor(kind, t)}</span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The sources that fed a Resumo, grouped by subject and section. Deliberately
 * dense and monochrome: it exists so the student can verify exactly which
 * modules, PDFs and quizzes the AI read.
 */
export function SummarySources({ items, className }: { items: SummaryItem[]; className?: string }) {
  const { t } = useT();
  if (items.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>{t("summary.noSources")}</p>;
  }

  const modules = new Map<string, SummaryItem[]>();
  for (const item of items) {
    const key = item.moduleName ?? t("summary.otherModule");
    const list = modules.get(key) ?? [];
    list.push(item);
    modules.set(key, list);
  }

  return (
    <div className={cn("space-y-3", className)}>
      {[...modules.entries()].map(([moduleName, list]) => (
        <div key={moduleName}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {moduleName}
            <span className="ml-1.5 font-mono font-normal normal-case tabular-nums">{list.length}</span>
          </p>
          <ul className="divide-y overflow-hidden rounded-lg border">
            {list.map((item) => {
              const Icon = iconFor(item.kind);
              const details = [
                item.sectionTitle,
                item.files.length ? item.files.join(", ") : null,
                item.questions > 0 ? t("summary.questionsN", { n: item.questions }) : null,
                item.hidden ? t("summary.hiddenTag") : null,
              ].filter(Boolean);
              return (
                <li key={item.id} className="flex items-start gap-2 bg-card px-2.5 py-1.5">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-snug">{item.title}</p>
                    {details.length > 0 && (
                      <p className="truncate text-[10px] text-muted-foreground">{details.join(" · ")}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

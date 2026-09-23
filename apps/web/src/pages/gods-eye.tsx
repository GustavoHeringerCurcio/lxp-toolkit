import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Eye, Lock, TriangleAlert } from "lucide-react";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { RichText } from "@/components/rich-text";
import { kindShort } from "@/lib/kind";
import { cn } from "@/lib/utils";
import { godsEyeDeadlineLabel, isUpcoming, parseDeadlineTs } from "@/lib/status";
import type { Exercise } from "@/types";

function ItemCard({ item }: { item: Exercise }) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const questions = item.questions ?? [];

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/50 text-muted-foreground">
          <Eye className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{item.title}</span>
            {item.duplicate && (
              <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("godsEye.duplicate")}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{kindShort(item.kind, t)}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{item.moduleName || item.moduleTitle}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" aria-hidden />
              {godsEyeDeadlineLabel(item.deadlineAt, Date.now(), t, locale)}
            </span>
            {questions.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{t("godsEye.questions", { count: questions.length })}</span>
              </>
            )}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-soon">
            <Lock className="size-3" aria-hidden />
            {t("godsEye.readOnly")}
          </p>

          {item.instructionsHtml || item.instructionsText ? (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("godsEye.instructions")}
              </div>
              <RichText html={item.instructionsHtml} fallback={item.instructionsText} />
            </div>
          ) : null}

          {questions.length > 0 && (
            <ol className="space-y-3">
              {questions.map((q, i) => (
                <li key={q.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-sm font-medium">
                    {i + 1}. {q.text}
                  </div>
                  {q.options.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {q.options.map((o, oi) => (
                        <li key={o.id} className="flex gap-2 text-sm text-muted-foreground">
                          <span className="font-mono text-xs uppercase">{String.fromCharCode(97 + oi)})</span>
                          <span>{o.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: Exercise[] }) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {t("godsEye.count", { count: items.length })}
        </span>
      </div>
      <div className="grid gap-2">
        {items.map((e) => (
          <ItemCard key={e.id} item={e} />
        ))}
      </div>
    </section>
  );
}

export function GodsEyePage() {
  const { hiddenItems, items, loading } = useAppData();
  const { t } = useT();
  const [showDuplicates, setShowDuplicates] = useState(false);

  const hidden = useMemo(
    () => hiddenItems.filter((e) => showDuplicates || !e.duplicate),
    [hiddenItems, showDuplicates],
  );
  const duplicatesCount = hiddenItems.length - hidden.length;

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...items, ...hiddenItems]
      .filter((e) => !e.done && isUpcoming(e.deadlineAt, now))
      .sort((a, b) => (parseDeadlineTs(a.deadlineAt) as number) - (parseDeadlineTs(b.deadlineAt) as number))
      .slice(0, 25);
  }, [items, hiddenItems]);

  const empty = hidden.length === 0 && upcoming.length === 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-primary" aria-hidden />
          <h1 className="font-heading text-lg font-semibold">{t("godsEye.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("godsEye.subtitle")}</p>
      </header>

      {loading && hiddenItems.length === 0 ? null : empty ? (
        <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          <TriangleAlert className="size-4" aria-hidden />
          {t("godsEye.empty")}
        </div>
      ) : (
        <>
          <Section title={t("godsEye.hiddenSection")} items={hidden} />
          <Section title={t("godsEye.upcomingSection")} items={upcoming} />
        </>
      )}

      {duplicatesCount > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showDuplicates}
            onChange={(e) => setShowDuplicates(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          {t("godsEye.showDuplicates")} ({duplicatesCount})
        </label>
      )}
    </div>
  );
}

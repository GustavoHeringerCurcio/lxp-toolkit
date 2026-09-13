import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAppData, useScopePrefs } from "@/lib/app-state";
import { cmpOpen, countInfo } from "@/lib/status";
import { useT, type TranslateFn } from "@/lib/i18n";
import { ActivityCard } from "@/components/activity-card";
import { NextHero, ProgressSummary, type ModuleProgress } from "@/components/agora-hero";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";

function greeting(t: TranslateFn): string {
  const h = new Date().getHours();
  if (h < 6) return t("greeting.night");
  if (h < 12) return t("greeting.morning");
  if (h < 18) return t("greeting.afternoon");
  return t("greeting.evening");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SkeletonMain() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="h-16 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function AgoraPage() {
  const { items, loading } = useAppData();
  const { setModuleFilter } = useScopePrefs();
  const { t, locale } = useT();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(6);

  const counts = useMemo(() => countInfo(items), [items]);
  const next = useMemo(() => items.filter((e) => e.status === "open").sort((a, b) => cmpOpen(a, b, locale))[0] ?? null, [items, locale]);
  const queueAll = useMemo(
    () =>
      items
        .filter((e) => e.status !== "done")
        .filter((e) => e.id !== next?.id)
        .sort((a, b) => cmpOpen(a, b, locale)),
    [items, next, locale],
  );
  const queue = useMemo(() => queueAll.slice(0, visible), [queueAll, visible]);
  const overdue = useMemo(() => queue.filter((e) => e.status === "expired"), [queue]);
  const upcoming = useMemo(() => queue.filter((e) => e.status !== "expired"), [queue]);
  const hidden = Math.max(0, counts.open - (next ? 1 : 0) - upcoming.length);

  const modules = useMemo<ModuleProgress[]>(() => {
    const map = new Map<string, ModuleProgress>();
    for (const e of items) {
      if (!e.moduleName) continue;
      const m = map.get(e.moduleName) ?? { name: e.moduleName, done: 0, open: 0, late: 0, total: 0 };
      m.total += 1;
      if (e.status === "done" || e.done) m.done += 1;
      else if (e.status === "expired") m.late += 1;
      else m.open += 1;
      map.set(e.moduleName, m);
    }
    return [...map.values()].sort((a, b) => b.open + b.late - (a.open + a.late));
  }, [items]);

  if (loading && items.length === 0) return <SkeletonMain />;

  const dateLabel = capitalize(new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date()));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      {items.length > 0 && (
        <ProgressSummary
          modules={modules}
          totals={{ done: counts.done, late: counts.expired, open: counts.open, total: items.length }}
          onSelect={(name) => {
            setModuleFilter(name);
            navigate("/tarefas");
          }}
        />
      )}

      <header className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{dateLabel}</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting(t)}.
        </h1>
      </header>

      {items.length === 0 ? (
        <NoData title={t("now.emptyTitle")} detail={t("now.emptyDetail")} />
      ) : (
        <>
          {next && <NextHero next={next} onClick={() => navigate(`/tarefa/${next.id}`)} />}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold tracking-tight">{t("now.queue")}</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/tarefas")}>
                {t("now.seeAll")}
                <ArrowRight />
              </Button>
            </div>
            {queue.length === 0 ? (
              <NoData title={t("now.queueEmptyTitle")} detail={t("now.queueEmptyDetail")} />
            ) : (
              <div className="space-y-4">
                {overdue.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-late">
                      {t("now.queueOverdue")}
                    </h3>
                    <div className="grid gap-2.5">
                      {overdue.map((e) => (
                        <ActivityCard key={e.id} e={e} />
                      ))}
                    </div>
                  </div>
                )}
                {upcoming.length > 0 && (
                  <div>
                    {overdue.length > 0 && (
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("now.queueUpcoming")}
                      </h3>
                    )}
                    <div className="grid gap-2.5">
                      {upcoming.map((e) => (
                        <ActivityCard key={e.id} e={e} />
                      ))}
                    </div>
                  </div>
                )}
                {hidden > 0 && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setVisible((v) => v + 2)}>
                    {t("now.queueMore", { n: hidden })}
                  </Button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

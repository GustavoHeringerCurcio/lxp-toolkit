import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { countInfo, cmpOpen } from "@/lib/status";
import { useAppData, useScopePrefs, type Scope } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import { ActivityCard } from "@/components/activity-card";
import { KIND_ORDER, kindMeta, kindShort } from "@/lib/kind";
import type { ExerciseKind } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";

const SCOPES: Scope[] = ["open", "expired", "done", "all"];

function SkeletonMain() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="h-9 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TarefasPage() {
  const { items, loading } = useAppData();
  const { scope, setScope, moduleFilter, setModuleFilter, typeFilter, setTypeFilter } = useScopePrefs();
  const { t, locale } = useT();

  const counts = useMemo(() => countInfo(items), [items]);
  const modules = useMemo(
    () =>
      [...new Set(items.map((e) => e.moduleName).filter((m): m is string => !!m))].sort((a, b) =>
        a.localeCompare(b, locale),
      ),
    [items, locale],
  );

  const scoped = useMemo(() => items.filter((e) => scope === "all" || e.status === scope), [items, scope]);
  const typeCounts = useMemo(() => {
    const c: Record<ExerciseKind, number> = { quiz: 0, upload: 0, forum: 0, mark: 0, other: 0 };
    for (const e of scoped) c[e.kind] += 1;
    return c;
  }, [scoped]);
  const shown = useMemo(() => {
    let list = moduleFilter ? scoped.filter((e) => e.moduleName === moduleFilter) : scoped;
    if (typeFilter) list = list.filter((e) => e.kind === typeFilter);
    return [...list].sort((a, b) => cmpOpen(a, b, locale));
  }, [scoped, moduleFilter, typeFilter, locale]);

  if (loading && items.length === 0) return <SkeletonMain />;

  const filtersActive = moduleFilter !== null || typeFilter !== null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      {/* scope tabs */}
      <div
        role="tablist"
        aria-label={t("tasks.filterAria")}
        className="flex w-fit items-center gap-0.5 rounded-full border bg-card p-1"
      >
        {SCOPES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              scope === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t(`scope.${s}`)}
            <span className="ml-1.5 font-mono text-[11px] tabular-nums opacity-70">
              {s === "open" ? counts.open : s === "expired" ? counts.expired : s === "done" ? counts.done : items.length}
            </span>
          </button>
        ))}
      </div>

      {/* module chips */}
      {modules.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("tasks.modules")}
          </span>
          {modules.map((m) => (
            <button
              key={m}
              onClick={() => setModuleFilter(moduleFilter === m ? null : m)}
              aria-pressed={moduleFilter === m}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                moduleFilter === m
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* type chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("tasks.type")}
        </span>
        {KIND_ORDER.map((k) => {
          const Icon = kindMeta(k).icon;
          return (
            <button
              key={k}
              onClick={() => setTypeFilter(typeFilter === k ? null : k)}
              aria-pressed={typeFilter === k}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                typeFilter === k
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Icon className="size-3" aria-hidden />
              {kindShort(k, t)}
              <span className="font-mono tabular-nums opacity-60">{typeCounts[k]}</span>
            </button>
          );
        })}
      </div>

      {/* list */}
      {shown.length === 0 ? (
        <NoData
          title={filtersActive ? t("tasks.emptyFilteredTitle") : t("tasks.emptyTitle")}
          detail={
            filtersActive
              ? t("tasks.emptyFilteredDetail")
              : t("tasks.emptyScopeDetail", { scope: t(`scope.${scope}`) })
          }
          action={
            filtersActive ? (
              <button
                onClick={() => {
                  setModuleFilter(null);
                  setTypeFilter(null);
                }}
                className="rounded-full border px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {t("tasks.clearFilters")}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2.5">
          {shown.map((e) => (
            <ActivityCard key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

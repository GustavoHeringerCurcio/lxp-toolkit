import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { countInfo } from "@/lib/status";
import { useAppData, useScopePrefs, type Scope } from "@/lib/app-state";
import { ActivityCard } from "@/components/activity-card";
import { NextCard, StatCards, type KpiKey } from "@/components/section-cards";
import { KIND_ORDER, kindMeta } from "@/lib/kind";
import type { ExerciseKind } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";

export const SCOPE_LABEL: Record<Scope, string> = {
  open: "Abertas",
  expired: "Atrasadas",
  done: "Concluídas",
  all: "Todas",
};

function cmpOpen(a: { status: string; daysLeft: number | null; title: string }, b: { status: string; daysLeft: number | null; title: string }): number {
  const rank = (s: string): number => (s === "open" ? 0 : s === "expired" ? 1 : 2);
  const r = rank(a.status) - rank(b.status);
  if (r) return r;
  const da = a.daysLeft ?? Infinity;
  const db = b.daysLeft ?? Infinity;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title, "pt");
}

function SkeletonMain() {
  return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-xl border border-border bg-card" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { items, loading, error, reload } = useAppData();
  const { scope, setScope, moduleFilter, setModuleFilter, typeFilter, setTypeFilter } = useScopePrefs();
  const navigate = useNavigate();

  const counts = useMemo(() => countInfo(items), [items]);
  const modules = useMemo(
    () =>
      [...new Set(items.map((e) => e.moduleName).filter((m): m is string => !!m))].sort((a, b) => a.localeCompare(b, "pt")),
    [items],
  );

  const scoped = useMemo(() => items.filter((e) => scope === "all" || e.status === scope), [items, scope]);
  const typeCounts = useMemo(() => {
    const c: Record<ExerciseKind, number> = { quiz: 0, upload: 0, mark: 0, other: 0 };
    for (const e of scoped) c[e.kind] += 1;
    return c;
  }, [scoped]);
  const shown = useMemo(() => {
    let list = moduleFilter ? scoped.filter((e) => e.moduleName === moduleFilter) : scoped;
    if (typeFilter) list = list.filter((e) => e.kind === typeFilter);
    return [...list].sort(cmpOpen);
  }, [scoped, moduleFilter, typeFilter]);

  const next = useMemo(() => items.filter((e) => e.status === "open").sort(cmpOpen)[0] ?? null, [items]);

  const openExercise = (id: number) => navigate(`/tarefa/${id}`);
  const onKpi = (k: KpiKey) => setScope(k as Scope);

  if (loading && items.length === 0) {
    return (
      <div className="p-4">
        <SkeletonMain />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {scope !== "done" && next && <NextCard next={next} onClick={() => openExercise(next.id)} />}
      <StatCards counts={counts} active={scope === "all" ? null : (scope as KpiKey)} onSelect={onKpi} />

      {modules.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Módulos
          </span>
          <button
            onClick={() => setModuleFilter(null)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              moduleFilter === null
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            Todos
          </button>
          {modules.map((m) => (
            <button
              key={m}
              onClick={() => setModuleFilter(moduleFilter === m ? null : m)}
              aria-pressed={moduleFilter === m}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                moduleFilter === m
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Tipos
          </span>
          <button
            onClick={() => setTypeFilter(null)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              typeFilter === null
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            Todos
          </button>
          {KIND_ORDER.map((k) => {
            const meta = kindMeta(k);
            const Icon = meta.icon;
            const active = typeFilter === k;
            return (
              <button
                key={k}
                onClick={() => setTypeFilter(active ? null : k)}
                aria-pressed={active}
                title={meta.label}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {meta.short}
                <span className="tabular-nums text-muted-foreground">{typeCounts[k]}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {SCOPE_LABEL[scope]} · <span className="font-medium text-foreground">{shown.length}</span>
        </span>
        {(moduleFilter || typeFilter) && (
          <span className="flex items-center gap-3">
            {moduleFilter && (
              <button onClick={() => setModuleFilter(null)} className="text-xs text-brand underline-offset-4 hover:underline">
                limpar módulo
              </button>
            )}
            {typeFilter && (
              <button onClick={() => setTypeFilter(null)} className="text-xs text-brand underline-offset-4 hover:underline">
                limpar tipo
              </button>
            )}
          </span>
        )}
      </div>

      {error && shown.length === 0 && items.length === 0 ? (
        <NoData title="Não conseguimos carregar suas tarefas." detail={error} />
      ) : shown.length === 0 ? (
        <NoData
          title={items.length === 0 ? "Nenhuma atividade" : "Nada por aqui"}
          detail={
            items.length === 0
              ? "Nenhuma atividade encontrada. Clique em \"Atualizar\" no topo para buscar seu conteúdo."
              : moduleFilter && typeFilter
                ? `Não há atividades ${SCOPE_LABEL[scope].toLowerCase()} deste tipo neste módulo.`
                : moduleFilter
                  ? `Não há atividades ${SCOPE_LABEL[scope].toLowerCase()} neste módulo.`
                  : typeFilter
                    ? `Não há atividades ${SCOPE_LABEL[scope].toLowerCase()} deste tipo.`
                    : `Não há atividades ${SCOPE_LABEL[scope].toLowerCase()}.`
          }
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
          {shown.map((e) => (
            <ActivityCard key={e.id} e={e} />
          ))}
        </div>
      )}

      {error && shown.length > 0 && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Falha ao atualizar: {error}
          <button className="ml-2 text-xs underline" onClick={reload}>
            tentar de novo
          </button>
        </p>
      )}
    </div>
  );
}

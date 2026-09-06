import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Inbox, RefreshCw } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { fetchConfig, fetchExercises, saveNote, type AiConfigDto } from "@/api";
import type { Exercise } from "@/types";
import { AppSidebar, type Scope } from "@/components/app-sidebar";
import { ActivityCard } from "@/components/activity-card";
import { ActivityDetail } from "@/components/activity-detail";
import { NextCard, StatCards, type KpiKey } from "@/components/section-cards";
import { countInfo } from "@/lib/status";

function cmp(a: Exercise, b: Exercise): number {
  const rank = (s: Exercise["status"]) => (s === "open" ? 0 : s === "expired" ? 1 : 2);
  const r = rank(a.status) - rank(b.status);
  if (r) return r;
  const da = a.daysLeft ?? Infinity;
  const db = b.daysLeft ?? Infinity;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title, "pt");
}

const SCOPE_LABEL: Record<Scope, string> = {
  open: "Abertas",
  expired: "Atrasadas",
  done: "Concluídas",
  all: "Todas",
};

function SkeletonMain() {
  return (
    <main className="space-y-4 p-4">
      <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
        <div className="hidden h-[70vh] animate-pulse rounded-xl border border-border bg-card lg:block" />
      </div>
    </main>
  );
}

export default function App() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [cfg, setCfg] = useState<AiConfigDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("open");
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [p, c] = await Promise.all([fetchExercises(), fetchConfig()]);
      setItems(p.exercises);
      setCfg(c);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const counts = useMemo(() => countInfo(items), [items]);

  const modules = useMemo(
    () =>
      [...new Set(items.map((e) => e.moduleName).filter((m): m is string => !!m))].sort((a, b) => a.localeCompare(b, "pt")),
    [items],
  );

  const scoped = useMemo(() => items.filter((e) => scope === "all" || e.status === scope), [items, scope]);

  const shown = useMemo(() => {
    const list = moduleFilter ? scoped.filter((e) => e.moduleName === moduleFilter) : scoped;
    return [...list].sort(cmp);
  }, [scoped, moduleFilter]);

  const professors = useMemo(
    () => [...new Set(items.map((e) => e.professor).filter((p): p is string => !!p))].sort(),
    [items],
  );

  const next = useMemo(() => items.filter((e) => e.status === "open").sort(cmp)[0] ?? null, [items]);
  const sel = shown.find((x) => x.id === selected) ?? shown[0] ?? null;

  const onScope = useCallback((s: Scope) => setScope(s), []);
  const onKpi = useCallback(
    (k: KpiKey) => {
      setScope(k);
      if (moduleFilter) setSelected(null);
    },
    [moduleFilter],
  );

  const onNote = async (notes: string) => {
    if (!sel) return;
    await saveNote(sel.id, notes);
    await reload();
  };

  if (err) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive"
        >
          <div className="flex items-center gap-2 font-semibold">
            <CircleAlert className="size-5 shrink-0" aria-hidden />
            <span>Não conseguimos carregar suas tarefas.</span>
          </div>
          <p className="mt-2 leading-relaxed text-destructive/90">
            O painel ainda não tem os dados prontos ou o serviço local não respondeu. Não é nada com a sua conta.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={reload}>
            <RefreshCw aria-hidden />
            Tentar novamente
          </Button>
          <details className="mt-3 rounded-md border border-destructive/20 bg-background/60 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium hover:text-foreground">Detalhes técnicos</summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-destructive/80">{err}</pre>
            <p className="mt-3 font-medium text-foreground">O que verificar</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>
                Dentro de <code>assistant/</code>: rode <code>npm run index</code> e depois <code>npm run web</code>.
              </li>
              <li>
                Em dev: <code>npm run web:dev</code> (front :5174) + <code>tsx server/server.ts</code> (API :4174).
              </li>
              <li>
                Sem dados de origem, rode <code>npm run dump</code> na raiz e repita o index.
              </li>
            </ul>
          </details>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar courseName={items[0]?.courseName ?? "LXP"} counts={counts} scope={scope} onScope={onScope} professors={professors} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <div className="flex-1">
            <div className="font-heading text-sm font-semibold">Minhas tarefas</div>
          </div>
          {cfg && (
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
              modelo {cfg.model}
            </span>
          )}
          <Button variant="ghost" size="icon" title="atualizar" aria-label="atualizar" onClick={reload}>
            <RefreshCw />
          </Button>
        </header>

        {loading ? (
          <SkeletonMain />
        ) : (
          <main className="space-y-4 p-4">
            {scope !== "done" && next && <NextCard next={next} />}
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

            <div className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {SCOPE_LABEL[scope]} · <span className="font-medium text-foreground">{shown.length}</span>
              </span>
              {moduleFilter && (
                <button onClick={() => setModuleFilter(null)} className="text-xs text-brand underline-offset-4 hover:underline">
                  limpar módulo
                </button>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="scroll-area max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto pr-1">
                {shown.length === 0 ? (
                  <Empty className="min-h-48">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Inbox className="text-muted-foreground" aria-hidden />
                      </EmptyMedia>
                      <EmptyTitle>{items.length === 0 ? "Nenhuma atividade" : "Nada por aqui"}</EmptyTitle>
                    </EmptyHeader>
                    <EmptyContent>
                      <EmptyDescription>
                        {items.length === 0
                          ? "Nenhuma atividade encontrada. Rode `npm run index` dentro de assistant/ e atualize."
                          : moduleFilter
                            ? `Não há atividades ${SCOPE_LABEL[scope].toLowerCase()} neste módulo.`
                            : `Não há atividades ${SCOPE_LABEL[scope].toLowerCase()}.`}
                      </EmptyDescription>
                      {moduleFilter && (
                        <Button variant="outline" size="sm" onClick={() => setModuleFilter(null)}>
                          Ver todos os módulos
                        </Button>
                      )}
                    </EmptyContent>
                  </Empty>
                ) : (
                  shown.map((e) => (
                    <ActivityCard key={e.id} e={e} selected={sel?.id === e.id} onClick={() => setSelected(e.id)} />
                  ))
                )}
              </div>

              <div className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
                {sel ? (
                  <ActivityDetail key={sel.id} e={sel} cfg={cfg} onNote={onNote} onReload={reload} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">Selecione uma atividade.</p>
                )}
              </div>
            </div>
          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

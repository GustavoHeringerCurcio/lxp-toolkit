import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAppData, useScopePrefs } from "@/lib/app-state";
import { cmpOpen, countInfo } from "@/lib/status";
import { ActivityCard } from "@/components/activity-card";
import { ModuleMiniBars, NextHero, ProgressRing, type ModuleProgress } from "@/components/agora-hero";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
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
  const navigate = useNavigate();

  const counts = useMemo(() => countInfo(items), [items]);
  const next = useMemo(() => items.filter((e) => e.status === "open").sort(cmpOpen)[0] ?? null, [items]);
  const queue = useMemo(
    () =>
      items
        .filter((e) => e.status !== "done")
        .filter((e) => e.id !== next?.id)
        .sort(cmpOpen)
        .slice(0, 6),
    [items, next],
  );

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
    return [...map.values()].sort((a, b) => b.open + b.late - (a.open + a.late)).slice(0, 5);
  }, [items]);

  if (loading && items.length === 0) return <SkeletonMain />;

  const dateLabel = capitalize(dateFmt.format(new Date()));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{dateLabel}</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums text-muted-foreground">
              {counts.done}/{items.length}
            </div>
            <div className="text-[11px] text-muted-foreground">concluídas</div>
          </div>
          <ProgressRing done={counts.done} total={items.length} size={64} />
        </div>
      </header>

      {items.length === 0 ? (
        <NoData
          title="Nada na pauta"
          detail="Suas tarefas aparecem aqui assim que o conteúdo do portal for sincronizado."
        />
      ) : (
        <>
          {next && <NextHero next={next} onClick={() => navigate(`/tarefa/${next.id}`)} />}

          {modules.length > 0 && (
            <ModuleMiniBars
              modules={modules}
              onSelect={(name) => {
                setModuleFilter(name);
                navigate("/tarefas");
              }}
            />
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold tracking-tight">Fila aberta</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/tarefas")}>
                ver todas
                <ArrowRight />
              </Button>
            </div>
            {queue.length === 0 ? (
              <NoData title="Nada aberto" detail="Tudo em dia — aproveite a travessia." />
            ) : (
              <div className="grid gap-2.5">
                {queue.map((e) => (
                  <ActivityCard key={e.id} e={e} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

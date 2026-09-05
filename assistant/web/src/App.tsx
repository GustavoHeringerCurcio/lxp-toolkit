import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { fetchConfig, fetchExercises, saveNote, type AiConfigDto } from "@/api";
import type { Exercise } from "@/types";
import { AppSidebar, type Scope } from "@/components/app-sidebar";
import { ActivityCard } from "@/components/activity-card";
import { ActivityDetail } from "@/components/activity-detail";
import { NextCard, StatCards } from "@/components/section-cards";
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

export default function App() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [cfg, setCfg] = useState<AiConfigDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("open");
  const [selected, setSelected] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([fetchExercises(), fetchConfig()]);
      setItems(p.exercises);
      setCfg(c);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const shown = useMemo(
    () =>
      items
        .filter((e) => (scope === "all" ? true : e.status === scope))
        .sort(cmp),
    [items, scope],
  );

  const counts = useMemo(() => countInfo(items), [items]);
  const next = useMemo(() => items.filter((e) => e.status === "open").sort(cmp)[0] ?? null, [items]);
  const professors = useMemo(() => [...new Set(items.map((e) => e.professor).filter((p): p is string => !!p))].sort(), [items]);
  const sel = shown.find((x) => x.id === selected) ?? shown[0] ?? null;

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
            <CircleAlert className="size-5 shrink-0" />
            <span>Não conseguimos carregar suas tarefas.</span>
          </div>
          <p className="mt-2 leading-relaxed text-destructive/90">
            O painel ainda não tem os dados prontos ou o serviço local não respondeu. Não é nada com a sua conta.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={reload}>
            <RefreshCw />
            Tentar novamente
          </Button>
          <p className="mt-4 text-muted-foreground">
            Se o problema continuar, avise quem configurou este painel — os passos de manutenção estão abaixo.
          </p>
          <details className="mt-3 rounded-md border border-destructive/20 bg-background/60 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground hover:text-foreground">
              Detalhes técnicos (para quem mantém)
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-destructive/80">{err}</pre>
            <p className="mt-3 font-medium text-foreground">O que verificar</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>
                Dentro de <code>assistant/</code>: rode <code>npm run index</code> e depois <code>npm run web</code>, e
                abra esta página de novo.
              </li>
              <li>
                Em modo dev, além do <code>npm run web:dev</code> (front em :5174), o backend precisa rodar com{" "}
                <code>tsx server/server.ts</code> (em :4174).
              </li>
              <li>
                Se os dados de origem não existirem, rode <code>npm run dump</code> na raiz do repositório e repita o{" "}
                <code>npm run index</code> dentro de <code>assistant/</code>.
              </li>
            </ul>
          </details>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar courseName={items[0]?.courseName ?? "LXP"} counts={counts} scope={scope} onScope={setScope} professors={professors} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Minhas tarefas</div>
            <div className="text-[11px] text-muted-foreground">
              {counts.open} abertas · {counts.expired} atrasadas · {counts.done} concluídas
            </div>
          </div>
          {cfg && (
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
              modelo {cfg.model}
            </span>
          )}
          <Button variant="ghost" size="icon" title="atualizar" onClick={reload}>
            <RefreshCw />
          </Button>
        </header>

        <main className="space-y-4 p-4">
          <NextCard next={next} />
          <StatCards counts={counts} />

          <div className="text-sm text-muted-foreground">
            {scope === "open" ? "Abertas" : scope === "expired" ? "Atrasadas" : scope === "done" ? "Concluídas" : "Todas"} · {shown.length}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <div className="scroll-area max-h-[calc(100vh-21rem)] space-y-2 overflow-y-auto pr-1">
              {shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nada aqui.</p>}
              {shown.map((e) => (
                <ActivityCard key={e.id} e={e} selected={sel?.id === e.id} onClick={() => setSelected(e.id)} />
              ))}
            </div>
            <div className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              {sel ? <ActivityDetail key={sel.id} e={sel} cfg={cfg} onNote={onNote} onReload={reload} /> : <p className="py-10 text-center text-sm text-muted-foreground">Selecione uma atividade.</p>}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

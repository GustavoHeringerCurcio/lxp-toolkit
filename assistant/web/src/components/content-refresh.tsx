import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { fetchRefreshStatus, startContentRefresh, type RefreshStatus } from "@/api";
import { Button } from "@/components/ui/button";

const IDLE: RefreshStatus = {
  running: false,
  step: "",
  error: null,
  startedAt: null,
  finishedAt: null,
};

/**
 * Drives the "update everything" flow: starts the server-side scrape and polls
 * its progress, calling `onDone` (usually a data reload) when it finishes.
 */
export function useContentRefresh(onDone: () => void) {
  const [state, setState] = useState<RefreshStatus>(IDLE);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const activeRef = useRef(false);

  const poll = useCallback(async () => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      let next: RefreshStatus;
      try {
        next = await fetchRefreshStatus();
      } catch (x) {
        activeRef.current = false;
        setState((prev) => ({
          ...prev,
          running: false,
          error: x instanceof Error ? x.message : String(x),
        }));
        return;
      }
      setState(next);
      if (!next.running) {
        activeRef.current = false;
        if (!next.error) onDoneRef.current();
        return;
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setState({ ...IDLE, running: true, step: "Iniciando…" });
    try {
      await startContentRefresh();
    } catch (x) {
      activeRef.current = false;
      setState({ ...IDLE, error: x instanceof Error ? x.message : String(x) });
      return;
    }
    await poll();
  }, [poll]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchRefreshStatus();
        if (cancelled || !s.running) return;
        activeRef.current = true;
        setState(s);
        await poll();
      } catch {
        // rota indisponível ou servidor offline: ignora
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poll]);

  return { state, start };
}

export function ContentRefreshButton({
  state,
  onStart,
}: {
  state: RefreshStatus;
  onStart: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onStart}
      disabled={state.running}
      title="Buscar conteúdo novo no portal"
      aria-label="Atualizar conteúdo"
    >
      {state.running ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      <span className="hidden sm:inline">{state.running ? "Atualizando…" : "Atualizar"}</span>
    </Button>
  );
}

export function ContentRefreshBanner({ state }: { state: RefreshStatus }) {
  if (!state.running && !state.error) return null;
  return (
    <div
      className={
        state.error
          ? "flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
          : "flex items-center gap-2 border-b border-brand/30 bg-brand/10 px-4 py-2 text-xs text-brand"
      }
      role="status"
    >
      {state.running && <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />}
      {state.error ? (
        <span>Falha ao atualizar: {state.error}</span>
      ) : (
        <span>{state.step || "Atualizando…"}…</span>
      )}
    </div>
  );
}

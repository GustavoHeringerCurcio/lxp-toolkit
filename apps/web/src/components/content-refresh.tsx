import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { fetchRefreshStatus, startContentRefresh, type RefreshStatus } from "@/api";
import { Button } from "@/components/ui/button";
import { serverStepKey, useT } from "@/lib/i18n";

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
  const { t } = useT();
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
    setState({ ...IDLE, running: true, step: t("refresh.starting") });
    try {
      await startContentRefresh();
    } catch (x) {
      activeRef.current = false;
      setState({ ...IDLE, error: x instanceof Error ? x.message : String(x) });
      return;
    }
    await poll();
  }, [poll, t]);

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

interface PortalRefreshValue {
  state: RefreshStatus;
  start: () => void;
}

const PortalRefreshContext = createContext<PortalRefreshValue | null>(null);

/**
 * Single shared instance of the portal-refresh flow, so the header button and
 * the command palette drive the same scrape/poll (and both resume if one is
 * already running on mount).
 */
export function RefreshProvider({ onDone, children }: { onDone: () => void; children: ReactNode }) {
  const { state, start } = useContentRefresh(onDone);
  const value = useMemo<PortalRefreshValue>(() => ({ state, start }), [state, start]);
  return <PortalRefreshContext.Provider value={value}>{children}</PortalRefreshContext.Provider>;
}

export function usePortalRefresh(): PortalRefreshValue {
  const ctx = useContext(PortalRefreshContext);
  if (!ctx) throw new Error("usePortalRefresh fora de RefreshProvider");
  return ctx;
}

export function ContentRefreshButton({
  state,
  onStart,
}: {
  state: RefreshStatus;
  onStart: () => void;
}) {
  const { t } = useT();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onStart}
      disabled={state.running}
      title={t("refresh.buttonTitle")}
      aria-label={t("refresh.buttonAria")}
    >
      {state.running ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      <span className="hidden sm:inline">{state.running ? t("refresh.updating") : t("refresh.update")}</span>
    </Button>
  );
}

export function ContentRefreshBanner({ state }: { state: RefreshStatus }) {
  const { t } = useT();
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
        <span>{t("refresh.failed", { error: state.error })}</span>
      ) : (
        <span>{t(state.step ? serverStepKey(state.step) : "refresh.updating")}…</span>
      )}
    </div>
  );
}

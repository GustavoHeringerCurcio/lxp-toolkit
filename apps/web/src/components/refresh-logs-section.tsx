import { useEffect, useState } from "react";
import { ChevronDown, Clock3, FileJson, RefreshCw } from "lucide-react";
import {
  fetchRefreshLogs,
  fetchRefreshRunLog,
  fetchRefreshSchedulerLog,
  type RefreshLogRun,
  type RefreshLogSchedulerDay,
  type RefreshLogsIndex,
} from "@/api";
import { formatLastRefresh } from "@/components/content-refresh";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function fmtDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function statusTone(status: string): string {
  if (status === "ok") return "border-ok/30 bg-ok/10 text-ok";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-brand/30 bg-brand/10 text-brand";
}

/**
 * JSON refresh logs: the latest snapshot plus one file per run. The files live
 * under apps/server/data/logs/refresh (readable by a person or an agent).
 */
export function RefreshLogsSection() {
  const { t, locale } = useT();
  const [index, setIndex] = useState<RefreshLogsIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [run, setRun] = useState<RefreshLogRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [scheduler, setScheduler] = useState<RefreshLogSchedulerDay | null>(null);

  const timeZone = index?.status?.timezone ?? "America/Sao_Paulo";

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setIndex(await fetchRefreshLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleRun = async (file: string): Promise<void> => {
    if (openFile === file) {
      setOpenFile(null);
      setRun(null);
      return;
    }
    setOpenFile(file);
    setRun(null);
    setRunLoading(true);
    try {
      setRun(await fetchRefreshRunLog(file));
    } catch {
      setRun(null);
    } finally {
      setRunLoading(false);
    }
  };

  const toggleScheduler = async (): Promise<void> => {
    const next = !schedulerOpen;
    setSchedulerOpen(next);
    if (!next || scheduler) return;
    const date = index?.schedulerDays[0];
    if (!date) return;
    try {
      setScheduler(await fetchRefreshSchedulerLog(date));
    } catch {
      setScheduler(null);
    }
  };

  const status = index?.status;
  const lastSuccess =
    formatLastRefresh(status?.lastSuccessAt, locale, timeZone) ?? t("settings.logs.never");

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <p className="text-xs text-muted-foreground">{t("settings.logs.intro")}</p>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto shrink-0"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          {t("settings.logs.refresh")}
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {t("settings.logs.error", { error })}
        </p>
      )}

      {status && (
        <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("settings.logs.lastSuccess")}
            </p>
            <p className="mt-0.5 font-medium text-foreground/90">{lastSuccess}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("settings.logs.schedule")}
            </p>
            <p className="mt-0.5 font-medium text-foreground/90">
              {status.slots.join(", ") || "—"}
              {status.quietHours
                ? ` · ${t("settings.logs.quiet", {
                    start: status.quietHours.start,
                    end: status.quietHours.end,
                  })}`
                : ""}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("settings.logs.lastDecision")}
            </p>
            <p className="mt-0.5 truncate font-medium text-foreground/90" title={status.lastDecision ?? ""}>
              {status.lastDecision ?? "—"}
            </p>
          </div>
        </div>
      )}

      {loading && !index ? (
        <p className="text-xs text-muted-foreground">{t("settings.logs.loading")}</p>
      ) : !index || index.runs.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {t("settings.logs.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {index.runs.map((entry) => {
            const open = openFile === entry.file;
            return (
              <li key={entry.file} className="rounded-lg border border-border/60 bg-muted/20">
                <button
                  type="button"
                  onClick={() => void toggleRun(entry.file)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/40"
                >
                  <FileJson className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-medium text-foreground/90">
                    {formatLastRefresh(entry.startedAt, locale, timeZone) ?? entry.startedAt}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                      statusTone(entry.status),
                    )}
                  >
                    {t(`settings.logs.status.${entry.status}`)}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {entry.source} · {fmtDuration(entry.durationMs)}
                  </span>
                  <ChevronDown
                    className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div className="space-y-2 border-t border-border/60 p-3">
                    {runLoading ? (
                      <p className="text-xs text-muted-foreground">{t("settings.logs.loading")}</p>
                    ) : run ? (
                      <>
                        <div className="grid gap-2 text-[11px] sm:grid-cols-4">
                          <div>
                            <p className="text-muted-foreground">{t("settings.logs.started")}</p>
                            <p className="font-mono text-foreground/90">{run.localStartedAt}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("settings.logs.statusLabel")}</p>
                            <p className="font-mono text-foreground/90">
                              {t(`settings.logs.status.${run.status}`)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("settings.logs.source")}</p>
                            <p className="font-mono text-foreground/90">{run.source}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t("settings.logs.duration")}</p>
                            <p className="font-mono text-foreground/90">{fmtDuration(run.durationMs)}</p>
                          </div>
                        </div>
                        {run.error && (
                          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                            {run.error}
                          </p>
                        )}
                        {run.warning && (
                          <p className="rounded-md border border-soon/30 bg-soon-bg px-2.5 py-1.5 text-[11px] text-soon">
                            {run.warning}
                          </p>
                        )}
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            {t("settings.logs.logExcerpt")}
                            {run.logTruncated ? t("settings.logs.truncated") : ""}
                          </p>
                          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-foreground/80">
                            {run.logExcerpt || "—"}
                          </pre>
                        </div>
                        <details>
                          <summary className="cursor-pointer text-[11px] text-muted-foreground">
                            {t("settings.logs.json")}
                          </summary>
                          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-foreground/80">
                            {JSON.stringify(run, null, 2)}
                          </pre>
                        </details>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("settings.logs.none")}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => void toggleScheduler()}
          aria-expanded={schedulerOpen}
          className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/40"
        >
          <Clock3 className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="font-medium text-foreground/90">{t("settings.logs.scheduler")}</span>
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 text-muted-foreground transition-transform",
              schedulerOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {schedulerOpen && (
          <pre className="max-h-72 overflow-auto rounded-lg bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-foreground/80">
            {scheduler ? JSON.stringify(scheduler, null, 2) : t("settings.logs.none")}
          </pre>
        )}
      </div>
    </div>
  );
}

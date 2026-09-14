import { useEffect, useState } from "react";
import { Bug, RefreshCw } from "lucide-react";
import { fetchDebugLogs } from "@/api";
import { useT } from "@/lib/i18n";
import type { DebugLogDto } from "@/types";
import { Button } from "@/components/ui/button";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * Recent weak-draft diagnostics: the reason a draft was flagged and the path of
 * the full-context markdown file (readable by a human or an agent).
 */
export function DebugLogsSection() {
  const { t } = useT();
  const [logs, setLogs] = useState<DebugLogDto[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      setLogs(await fetchDebugLogs());
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">{t("debug.intro")}</p>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          {t("debug.refresh")}
        </Button>
      </div>
      {logs.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {t("debug.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {logs.map((log) => (
            <li
              key={log.id}
              className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <Bug className="size-3.5 shrink-0 text-soon" aria-hidden />
                <span className="font-medium text-foreground/90">
                  {log.contentItemId != null ? `${t("debug.item")} ${log.contentItemId}` : t("debug.item")}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {fmtDate(log.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{log.reason}</p>
              {log.filePath && (
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={log.filePath}>
                  {log.filePath}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

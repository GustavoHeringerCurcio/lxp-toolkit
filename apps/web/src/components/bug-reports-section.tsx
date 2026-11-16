import { useEffect, useState } from "react";
import { Bug, Download, RefreshCw } from "lucide-react";
import { fetchBugReports, updateBugReport } from "@/api";
import { useT } from "@/lib/i18n";
import type { BugReportDto } from "@/types";
import { Button } from "@/components/ui/button";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const STATUS_CLASS: Record<string, string> = {
  open: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fixed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  dismissed: "border-border bg-muted/40 text-muted-foreground",
};

/**
 * Beta feedback list: problems reported from the send dialog, with the exact
 * generated artifact and enough context to reproduce them.
 */
export function BugReportsSection() {
  const { t } = useT();
  const [reports, setReports] = useState<BugReportDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setErr(false);
    try {
      setReports(await fetchBugReports());
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setStatus = async (report: BugReportDto, status: "open" | "fixed"): Promise<void> => {
    try {
      const next = await updateBugReport(report.id, { status });
      setReports((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    } catch {
      setErr(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">{t("bugs.intro")}</p>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          {t("bugs.refresh")}
        </Button>
      </div>

      {err && <p className="text-xs text-destructive">{t("bugs.error")}</p>}

      {reports.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {t("bugs.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <Bug className="size-3.5 shrink-0 text-foreground" aria-hidden />
                <span className="font-medium text-foreground/90">{report.activityTitle}</span>
                <span className="text-[10px] text-muted-foreground">#{report.id}</span>
                <span
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                    STATUS_CLASS[report.status] ?? STATUS_CLASS.open
                  }`}
                >
                  {t(`bugs.status.${report.status}`)}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {fmtDate(report.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.message}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span>{report.mode}</span>
                {report.courseName && <span>· {report.courseName}</span>}
                {report.gate?.reason && <span>· {report.gate.reason}</span>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                {report.hasArtifact && report.artifactId != null ? (
                  <a
                    href={`/api/artifact/${report.artifactId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                  >
                    <Download className="size-3" aria-hidden />
                    {t("bugs.download")}
                  </a>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{t("bugs.noArtifact")}</span>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-auto"
                  onClick={() =>
                    void setStatus(report, report.status === "open" ? "fixed" : "open")
                  }
                >
                  {report.status === "open" ? t("bugs.markFixed") : t("bugs.markOpen")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleCheckBig, ExternalLink, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchSubmissions, fmtVersionDate, type SubmissionDto } from "@/api";
import { useAppData } from "@/lib/app-state";
import { runMark } from "@/lib/mark";
import { contentLabel, kindLabel, kindMeta } from "@/lib/kind";
import { cn } from "@/lib/utils";
import { useT, type TranslateFn } from "@/lib/i18n";
import type { Exercise } from "@/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";

function submissionLabel(status: SubmissionDto["status"], t: TranslateFn): string {
  switch (status) {
    case "ok":
      return t("sub.mark.ok");
    case "already":
      return t("sub.mark.already");
    case "unknown":
      return t("sub.mark.unknown");
    case "failed":
      return t("sub.mark.failed");
    case "running":
      return t("sub.mark.running");
    default:
      return status;
  }
}

/** Right-column panel for items completed with the portal's "mark as completed" action. */
export function MarkPanel({ e, onRefresh }: { e: Exercise; onRefresh: () => void }) {
  const { patchExercise } = useAppData();
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sub, setSub] = useState<SubmissionDto | null>(null);
  const [subs, setSubs] = useState<SubmissionDto[]>([]);

  const loadSubs = useCallback(async () => {
    setSubs(await fetchSubmissions(e.id));
  }, [e.id]);

  useEffect(() => {
    setSub(null);
    setErr(null);
    void loadSubs();
  }, [e.id, loadSubs]);

  const isDone = e.done || e.status === "done";

  const doMark = async () => {
    setBusy(true);
    setErr(null);
    const toastId = toast.loading(t("toast.markLoading"), { description: t("toast.markLoadingDesc") });
    try {
      const final = await runMark(e.id, setSub);
      if (final.status === "ok" || final.status === "already") {
        toast.success(t("toast.markDone"), { id: toastId, description: final.detail });
        patchExercise(e.id, { done: true, status: "done" });
      } else {
        toast.error(t("toast.markFail"), { id: toastId, description: final.detail });
      }
      onRefresh();
      void loadSubs();
    } catch (x) {
      const msg = x instanceof Error ? x.message : String(x);
      setErr(msg);
      setSub(null);
      toast.error(t("toast.markFail"), { id: toastId, description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CollapsibleCard
      id="marcar"
      icon={<CircleCheckBig className="size-4 shrink-0 text-ok" aria-hidden />}
      title={t("mark.title")}
      className="xl:flex xl:h-full xl:min-h-0 xl:flex-col data-[open=false]:xl:h-auto"
      bodyClassName="flex-1 min-h-0 space-y-3 overflow-y-auto p-4"
      badge={
        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {contentLabel(e.contentKind, t)}
        </span>
      }
      footer={
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border/60 bg-card px-4 py-3">
          {isDone ? (
            <Button size="sm" disabled className="bg-ok text-white disabled:opacity-100">
              <CheckCircle2 aria-hidden />
              {t("badge.done")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void doMark()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CircleCheckBig aria-hidden />}
              {busy ? t("mark.busy") : t("mark.button")}
            </Button>
          )}
          <a
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-auto")}
            href={`https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("mark.openPortal")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-foreground/90">
        {t("mark.body", { kind: kindLabel(e.kind, t) })}
      </p>
      {isDone && (
        <p className="rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
          {t("mark.doneBody")}
        </p>
      )}
      {err && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

      {sub && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border p-3 text-sm",
            (sub.status === "ok" || sub.status === "already") && "border-ok/40 bg-ok/10 text-ok",
            sub.status === "failed" && "border-destructive/40 bg-destructive/10 text-destructive",
            sub.status === "unknown" && "border-soon/40 bg-soon/10 text-soon",
            sub.status === "running" && "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {sub.status === "ok" || sub.status === "already" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="font-semibold">{submissionLabel(sub.status, t)}</div>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{sub.detail}</p>
          </div>
        </div>
      )}

      {subs.length > 0 && (
        <div className="rounded-md border border-border/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <History className="size-3.5" aria-hidden />
            {t("mark.history", { n: subs.length })}
          </div>
          <ul className="space-y-2">
            {[...subs].reverse().map((s) => (
              <li key={s.at} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    "mt-1 size-2 shrink-0 rounded-full",
                    (s.status === "ok" || s.status === "already") && "bg-ok",
                    s.status === "failed" && "bg-destructive",
                    s.status === "unknown" && "bg-soon",
                    s.status === "running" && "bg-muted-foreground",
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <span className="font-medium">{submissionLabel(s.status, t)}</span>
                  <span className="text-muted-foreground"> · {fmtVersionDate(s.at, locale)}</span>
                  <p className="break-words text-muted-foreground">{s.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CollapsibleCard>
  );
}

/** Fallback panel for actionable items with no in-app action (e.g. forum). */
export function PortalOnlyPanel({ e }: { e: Exercise }) {
  const { t } = useT();
  const meta = kindMeta(e.kind);
  return (
    <CollapsibleCard
      id="portal"
      icon={<meta.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      title={kindLabel(e.kind, t)}
      bodyClassName="space-y-3 p-4"
    >
      <p className="text-sm leading-relaxed text-foreground/90">
        {t("mark.portalOnly", { kind: contentLabel(e.contentKind, t) })}
      </p>
      <a
        className={buttonVariants({ variant: "outline", size: "sm" })}
        href={`https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`}
        target="_blank"
        rel="noreferrer"
      >
        {t("mark.openPortal")}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </CollapsibleCard>
  );
}

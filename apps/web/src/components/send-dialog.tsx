import { useEffect, useState } from "react";
import { Check, Download, Eye, Loader2, SendHorizontal, TriangleAlert } from "lucide-react";
import { fetchSendArtifact, type SendMode } from "@/api";
import type { Exercise } from "@/types";
import { useT } from "@/lib/i18n";
import { SEND_MODES } from "@/lib/send";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function StepDots({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cn("flex items-center gap-2", i < steps.length - 1 && "flex-1")}>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors",
                done && "bg-brand text-primary-foreground",
                active && "bg-brand text-primary-foreground ring-4 ring-brand/15",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[11px] font-semibold tracking-wider uppercase",
                active ? "text-brand" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function SendDialog({
  open,
  onOpenChange,
  exercise,
  draft,
  sending,
  sendErr,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise;
  draft: string;
  sending: boolean;
  sendErr: string | null;
  onConfirm: (mode: SendMode) => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<SendMode>("text");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const isUpload = exercise.kind === "upload";
  const wantsText = isUpload || exercise.kind === "forum";
  const hasContent = wantsText ? Boolean(draft.trim()) : exercise.selections.length > 0;
  const canConfirm = hasContent && !sending;

  const steps = isUpload
    ? [t("send.step.review"), t("send.step.format"), t("send.step.confirm")]
    : [t("send.step.review"), t("send.step.confirm")];

  const howKey =
    exercise.kind === "forum"
      ? "send.howForum"
      : !isUpload
        ? exercise.isSurvey
          ? "send.howSurvey"
          : "send.howQuiz"
        : mode === "text"
          ? "send.howText"
          : mode === "pdf"
            ? "send.howPdf"
            : "send.howTxt";

  useEffect(() => {
    setPreviewUrl(null);
    setPreviewText(null);
    setPreviewErr(null);
  }, [mode, open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const previewArtifact = async () => {
    if (mode !== "txt" && mode !== "pdf") return;
    setPreviewBusy(true);
    setPreviewErr(null);
    try {
      const { blob } = await fetchSendArtifact(exercise.id, draft, mode);
      if (mode === "pdf") {
        setPreviewText(null);
        setPreviewUrl(URL.createObjectURL(blob));
      } else {
        setPreviewUrl(null);
        setPreviewText(await blob.text());
      }
    } catch (x) {
      setPreviewErr(x instanceof Error ? x.message : String(x));
    } finally {
      setPreviewBusy(false);
    }
  };

  const downloadArtifact = async () => {
    if (mode !== "txt" && mode !== "pdf") return;
    setDownloadBusy(true);
    setPreviewErr(null);
    try {
      const { blob, filename } = await fetchSendArtifact(exercise.id, draft, mode, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (x) {
      setPreviewErr(x instanceof Error ? x.message : String(x));
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!sending) onOpenChange(next);
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={!sending}
      >
        <div className="flex items-start gap-3 border-b bg-muted/30 py-4 pr-12 pl-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <SendHorizontal className="size-[18px]" aria-hidden />
          </span>
          <DialogHeader className="gap-1">
            <DialogTitle className="text-base">{t("send.button")}</DialogTitle>
            <DialogDescription>{t("send.dialogDesc")}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          <StepDots steps={steps} current={steps.length - 1} />

          <Alert className="border-soon/40 bg-soon/10">
            <TriangleAlert className="text-soon" />
            <AlertTitle className="text-soon">{t("send.warning")}</AlertTitle>
            <AlertDescription className="text-foreground/80">
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>{t(howKey)}</li>
                <li>{t("send.irreversible")}</li>
                <li>{t("send.check")}</li>
              </ul>
            </AlertDescription>
          </Alert>

          {isUpload && (
            <div>
              <div className="mb-2 text-[13px] font-medium text-foreground">{t("send.formatTitle")}</div>
              <div role="radiogroup" aria-label={t("send.formatTitle")} className="grid grid-cols-3 gap-2">
                {SEND_MODES.map((m) => {
                  const Icon = m.icon;
                  const selected = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMode(m.value)}
                      disabled={sending}
                      className={cn(
                        "group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left outline-none transition-all",
                        "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                        selected
                          ? "border-brand/60 bg-brand/10 ring-1 ring-brand/40"
                          : "border-border bg-card hover:border-brand/40 hover:bg-accent/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg transition-colors",
                          selected
                            ? "bg-brand text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="text-[13px] leading-none font-medium">{t(m.labelKey)}</span>
                      <span className="text-[11px] leading-snug text-muted-foreground">{t(m.hintKey)}</span>
                      {selected && (
                        <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-brand text-primary-foreground">
                          <Check className="size-2.5" strokeWidth={3} aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {(() => {
                  const m = SEND_MODES.find((x) => x.value === mode);
                  return m ? t(m.hintKey) : "";
                })()}
              </p>

              {(mode === "txt" || mode === "pdf") && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void previewArtifact()}
                      disabled={previewBusy || !draft.trim()}
                    >
                      {previewBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
                      {t("send.preview")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void downloadArtifact()}
                      disabled={downloadBusy || !draft.trim()}
                    >
                      {downloadBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                      {t("send.download")}
                    </Button>
                  </div>
                  {previewErr && (
                    <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {previewErr}
                    </p>
                  )}
                  {previewUrl && (
                    <iframe
                      src={previewUrl}
                      title={t("send.previewTitle")}
                      className="mt-2 h-64 w-full rounded-lg border border-border bg-white"
                    />
                  )}
                  {previewText != null && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap">
                      {previewText}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {sendErr && (
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
              <TriangleAlert />
              <AlertDescription>{sendErr}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground sm:max-w-64">{t("send.confirmHint")}</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
              {t("send.cancel")}
            </Button>
            <Button variant="default" size="sm" onClick={() => onConfirm(mode)} disabled={!canConfirm}>
              {sending ? <Loader2 className="animate-spin" aria-hidden /> : <SendHorizontal aria-hidden />}
              {sending ? t("send.sending") : t("send.confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

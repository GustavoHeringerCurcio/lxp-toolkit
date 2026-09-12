import { useEffect, useState } from "react";
import { fetchSendArtifact, type SendMode } from "@/api";
import type { Exercise } from "@/types";
import { useT } from "@/lib/i18n";
import { SEND_MODES } from "@/lib/send";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  EyeIcon,
  SendIcon,
  SpinnerIcon,
  WarningIcon,
} from "@/components/icons/send-icons";

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

  const actionKey =
    exercise.kind === "forum"
      ? "send.action.forum"
      : !isUpload
        ? exercise.isSurvey
          ? "send.action.survey"
          : "send.action.quiz"
        : mode === "text"
          ? "send.action.text"
          : mode === "pdf"
            ? "send.action.pdf"
            : "send.action.txt";

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
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
        <div className="relative border-b px-5 py-4 pr-11">
          <div className="flex items-center gap-2.5">
            <span className="text-brand">
              <SendIcon className="size-[18px]" />
            </span>
            <DialogTitle className="text-lg leading-tight">{t("send.dialogTitle")}</DialogTitle>
          </div>
          <DialogDescription className="mt-2 flex items-center gap-1.5 text-xs font-medium text-soon">
            <WarningIcon className="size-3.5" />
            {t("send.dialogWarn")}
          </DialogDescription>
          <DialogClose
            disabled={sending}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 right-3 text-muted-foreground"
                aria-label={t("ui.close")}
              />
            }
          >
            <CloseIcon className="size-4" />
          </DialogClose>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          {isUpload ? (
            <div>
              <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("send.formatTitle")}
              </div>
              <div
                role="radiogroup"
                aria-label={t("send.formatTitle")}
                className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/40 p-1"
              >
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
                        "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium outline-none transition-all",
                        "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                        selected
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-[18px]" />
                      <span>{t(m.labelKey)}</span>
                      {selected && <CheckIcon className="size-3 text-brand" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t(actionKey)}</p>

              {(mode === "txt" || mode === "pdf") && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void previewArtifact()}
                      disabled={previewBusy || !draft.trim()}
                    >
                      {previewBusy ? (
                        <SpinnerIcon className="size-3.5 animate-spin" />
                      ) : (
                        <EyeIcon className="size-3.5" />
                      )}
                      {t("send.preview")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void downloadArtifact()}
                      disabled={downloadBusy || !draft.trim()}
                    >
                      {downloadBusy ? (
                        <SpinnerIcon className="size-3.5 animate-spin" />
                      ) : (
                        <DownloadIcon className="size-3.5" />
                      )}
                      {t("send.download")}
                    </Button>
                  </div>
                  {previewErr && (
                    <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {previewErr}
                    </p>
                  )}
                  {previewUrl && (
                    <iframe
                      src={previewUrl}
                      title={t("send.previewTitle")}
                      className="mt-3 h-64 w-full rounded-lg border border-border bg-white"
                    />
                  )}
                  {previewText != null && (
                    <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap">
                      {previewText}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t(actionKey)}</p>
          )}

          {sendErr && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <WarningIcon className="mt-0.5 size-4" />
              <span>{sendErr}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
            {t("send.cancel")}
          </Button>
          <Button variant="default" size="sm" onClick={() => onConfirm(mode)} disabled={!canConfirm}>
            {sending ? (
              <SpinnerIcon className="size-3.5 animate-spin" />
            ) : (
              <SendIcon className="size-3.5" />
            )}
            {sending ? t("send.sending") : t("send.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

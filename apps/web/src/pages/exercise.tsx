import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileType,
  History,
  Loader2,
  Maximize2,
  MessagesSquare,
  Minimize2,
  Paperclip,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  clearAnswerHistory,
  fetchAnswerState,
  fetchSendArtifact,
  fetchSendConfig,
  fetchSubmission,
  fetchSubmissions,
  fmtVersionDate,
  restoreAnswerVersion,
  saveManualAnswer,
  sendAnswerToPortal,
  snippet,
  streamGenerate,
  type SendConfigDto,
  type SendMode,
  type SubmissionDto,
} from "@/api";
import { toast } from "sonner";
import { useAppData } from "@/lib/app-state";
import { fmtDeadline } from "@/lib/status";
import { isOffice, previewUrl, remoteFileName } from "@/lib/files";
import { useT, type TranslateFn } from "@/lib/i18n";
import { cn, stripHtml } from "@/lib/utils";
import type { AnswerState, Exercise, ForumInfo, ForumPost, RemoteFile } from "@/types";
import { BackLink } from "@/components/app-sidebar";
import { CollapseButton, CollapsibleCard, useCardCollapse } from "@/components/collapsible-card";
import { AccChips } from "@/components/prof-chip";
import { AiRequestPanel } from "@/components/ai-request-panel";
import { MarkPanel, PortalOnlyPanel } from "@/components/mark-panel";
import { StatusBadge, TypeBadge, DoneBadge } from "@/components/status-badges";
import { kindMeta } from "@/lib/kind";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SEND_MODES: { value: SendMode; labelKey: string; hintKey: string; icon: typeof Type }[] = [
  { value: "text", labelKey: "send.mode.text.label", hintKey: "send.mode.text.hint", icon: Type },
  { value: "txt", labelKey: "send.mode.txt.label", hintKey: "send.mode.txt.hint", icon: FileText },
  { value: "pdf", labelKey: "send.mode.pdf.label", hintKey: "send.mode.pdf.hint", icon: FileType },
];

function sendModeLabel(mode: SendMode, t: TranslateFn): string {
  const mode0 = SEND_MODES.find((m) => m.value === mode);
  return mode0 ? t(mode0.labelKey) : mode;
}

function submissionLabel(status: SubmissionDto["status"], t: TranslateFn): string {
  switch (status) {
    case "ok":
      return t("sub.send.ok");
    case "already":
      return t("sub.send.already");
    case "unknown":
      return t("sub.send.unknown");
    case "failed":
      return t("sub.send.failed");
    case "running":
      return t("sub.send.running");
    default:
      return status;
  }
}

function AnswerPanel({
  e,
  onRefresh,
  autoGenerate,
  regenToken,
}: {
  e: Exercise;
  onRefresh: () => void;
  autoGenerate?: boolean;
  regenToken?: number;
}) {
  const [draft, setDraft] = useState(e.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<AnswerState | null>(null);
  const [sendCfg, setSendCfg] = useState<SendConfigDto | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>("text");
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [sub, setSub] = useState<SubmissionDto | null>(null);
  const [subs, setSubs] = useState<SubmissionDto[]>([]);
  const cancelRef = useRef(false);
  const busyRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { patchExercise } = useAppData();
  const { t, locale } = useT();

  const loadSubs = useCallback(async () => {
    setSubs(await fetchSubmissions(e.id));
  }, [e.id]);

  useEffect(() => {
    setDraft(e.answer ?? "");
    setErr(null);
    setSendOpen(false);
    setSendMode("text");
    setAgree(false);
    setSub(null);
    setSendErr(null);
    cancelRef.current = false;
    fetchSendConfig().then(setSendCfg);
    fetchAnswerState(e.id)
      .then((st) => {
        setState(st);
        if (st.current?.answer && !busyRef.current) setDraft(st.current.answer);
      })
      .catch(() => undefined);
    void loadSubs();
    // Reset only when the activity changes: a refresh after generating/sending
    // must not wipe the draft or the submission status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id]);

  const didAuto = useRef(false);
  useEffect(() => {
    if (autoGenerate && !busyRef.current && !didAuto.current) {
      didAuto.current = true;
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, e.id]);

  const lastRegen = useRef(regenToken ?? 0);
  useEffect(() => {
    if (regenToken == null || regenToken === lastRegen.current) return;
    lastRegen.current = regenToken;
    if (!busyRef.current) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenToken]);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, [e.id]);

  // Drop the blob URL whenever the preview changes or the panel unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // A preview is only valid for the draft/mode it was generated from.
  useEffect(() => {
    setPreviewUrl(null);
    setPreviewText(null);
    setPreviewErr(null);
  }, [draft, sendMode]);

  const setBusySync = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

  const generate = async (): Promise<string | null> => {
    setBusySync(true);
    setErr(null);
    setDraft("");
    const live = { value: "" };
    try {
      const st = await streamGenerate(e.id, (ev) => {
        if (ev.type === "delta") {
          live.value += ev.delta ?? "";
          setDraft(live.value);
        }
        if (ev.type === "done") {
          if (ev.answer) setDraft(ev.answer);
          setState({ current: ev.current ?? null, history: ev.history ?? [] });
        }
      });
      setState(st);
      onRefresh();
      return live.value || st.current?.answer || null;
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      return null;
    } finally {
      setBusySync(false);
    }
  };

  const save = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const st = await saveManualAnswer(e.id, draft);
      setState(st);
      onRefresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (index: number) => {
    setBusy(true);
    setErr(null);
    try {
      const st = await restoreAnswerVersion(e.id, index);
      setState(st);
      setDraft(st.current?.answer ?? "");
      onRefresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const wipeHistory = async () => {
    setBusy(true);
    setErr(null);
    try {
      const st = await clearAnswerHistory(e.id);
      setState(st);
      onRefresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (draft) await navigator.clipboard.writeText(draft);
  };

  const history = state?.history ?? [];
  const sortedHistory = [...history].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const current = state?.current;

  const confirmSend = async (answerOverride?: string) => {
    const answer = (answerOverride ?? draft).trim();
    const isQuiz = e.kind === "quiz";
    if (!answer && !(isQuiz && e.selections.length > 0)) return;
    setSending(true);
    setSendErr(null);
    cancelRef.current = false;
    setSub({ status: "running", detail: t("send.subInitDetail"), at: new Date().toISOString() });
    const toastId = toast.loading(t("toast.sendLoading"), {
      description: t("toast.sendLoadingDesc"),
    });
    try {
      const started = await sendAnswerToPortal(e.id, answer, sendMode, isQuiz ? e.selections : undefined);
      setSub(started);
      let final = started;
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 2_500));
        const cur = await fetchSubmission(e.id);
        if (cur && cur.status !== "running") {
          final = cur;
          setSub(cur);
          break;
        }
      }
      if (final.status === "ok") {
        toast.success(t("toast.sendOk"), {
          id: toastId,
          description: final.attachmentName
            ? t("toast.sendOkAttachment", { name: final.attachmentName })
            : final.detail || t("toast.sendOkPlain"),
        });
        patchExercise(e.id, { done: true, status: "done" });
      } else if (final.status === "already") {
        toast.info(t("toast.sendAlready"), { id: toastId, description: final.detail });
        patchExercise(e.id, { done: true, status: "done" });
      } else if (final.status === "unknown") {
        toast.warning(t("toast.sendUnknown"), {
          id: toastId,
          description: t("toast.sendUnknownDesc", { detail: final.detail }),
        });
      } else {
        toast.error(t("toast.sendFail"), { id: toastId, description: final.detail });
      }
      onRefresh();
      void loadSubs();
    } catch (x) {
      const msg = x instanceof Error ? x.message : String(x);
      setSendErr(msg);
      setSub(null);
      toast.error(t("toast.sendFail"), { id: toastId, description: msg });
    } finally {
      setSending(false);
      setSendOpen(false);
      cancelRef.current = true;
    }
  };

  const previewArtifact = async () => {
    if (sendMode !== "txt" && sendMode !== "pdf") return;
    setPreviewBusy(true);
    setPreviewErr(null);
    try {
      const { blob } = await fetchSendArtifact(e.id, draft, sendMode);
      if (sendMode === "pdf") {
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
    if (sendMode !== "txt" && sendMode !== "pdf") return;
    setDownloadBusy(true);
    setPreviewErr(null);
    try {
      const { blob, filename } = await fetchSendArtifact(e.id, draft, sendMode, true);
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

  const isUpload = e.kind === "upload";
  const isForum = e.kind === "forum";
  const wantsText = isUpload || isForum;
  const isDone = e.done || e.status === "done";
  const canSend =
    !isDone && Boolean(sendCfg?.enabled) && !sending && (wantsText ? Boolean(draft.trim()) : e.selections.length > 0);

  return (
    <CollapsibleCard
      id="resposta"
      icon={<Sparkles className="size-4 shrink-0 text-brand" aria-hidden />}
      title={t("draft.title")}
      className="xl:flex xl:h-full xl:min-h-0 xl:flex-col data-[open=false]:xl:h-auto"
      bodyClassName="flex-1 min-h-0 space-y-3 overflow-y-auto p-4"
      badge={
        <>
          {current && (
            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t("draft.saved", {
                date: fmtVersionDate(current.updatedAt, locale),
                source: current.source === "ai" ? t("draft.sourceAi") : t("draft.sourceManual"),
              })}
            </span>
          )}
          {e.status === "done" && (
            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">{t("draft.donePortal")}</span>
          )}
        </>
      }
      actions={
        (current || sortedHistory.length > 0) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="xs" className="gap-1.5" aria-label={t("history.aria")} />}
            >
              <History />
              {t("history.title")} {sortedHistory.length > 0 && `(${sortedHistory.length})`}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64 max-w-xs">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("history.previous")}</DropdownMenuLabel>
                {sortedHistory.length === 0 && (
                  <DropdownMenuItem disabled>{t("history.empty")}</DropdownMenuItem>
                )}
                {sortedHistory.map((h, i) => {
                  const realIndex = history.findIndex((x) => x.updatedAt === h.updatedAt);
                  return (
                    <DropdownMenuItem key={h.updatedAt + i} onClick={() => void restore(realIndex)} className="items-start">
                      <Undo2 className="mt-0.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {snippet(h.answer, 46) || t("history.emptySnippet")}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {fmtVersionDate(h.updatedAt, locale)} · {h.source === "ai" ? t("draft.sourceAi") : t("draft.sourceManual")}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  );
                })}
                {sortedHistory.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => void wipeHistory()}>
                      <Trash2 aria-hidden />
                      {t("history.clear")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
      footer={
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border/60 bg-card px-4 py-3">
          <Button size="sm" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {busy ? t("draft.generating") : current ? t("draft.new") : t("draft.generate")}
          </Button>
          <Button variant="outline" size="sm" onClick={save} disabled={busy || !draft.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {t("draft.save")}
          </Button>
          <Button variant="ghost" size="sm" onClick={copy} disabled={!draft.trim()}>
            <Copy aria-hidden />
            {t("draft.copy")}
          </Button>
          {current?.answer && (
            <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={`/api/export/${e.id}`}>
              <Download aria-hidden />
              .md
            </a>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isDone ? (
              <Button size="sm" disabled className="bg-ok text-white disabled:opacity-100">
                <CheckCircle2 aria-hidden />
                {t("badge.done")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSendErr(null);
                  setSendOpen((v) => !v);
                }}
                disabled={!canSend}
              >
                <Send aria-hidden />
                {t("send.button")}
              </Button>
            )}
          </div>
        </div>
      }
    >
        {wantsText ? (
          <Textarea
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            placeholder={
              isForum ? t("draft.forumPlaceholder") : t("draft.uploadPlaceholder")
            }
            rows={6}
            className="min-h-36 field-sizing-fixed leading-relaxed"
          />
        ) : e.selections.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            {t("draft.quizHint")}
          </p>
        ) : (
          <div className="rounded-md border border-ok/40 bg-ok/10 p-3">
            <p className="mb-1.5 text-xs font-semibold text-ok">
              {e.isSurvey ? t("send.answerSurvey") : t("send.answerQuiz")}
            </p>
            <ul className="space-y-1">
              {e.questions.map((q, qi) => {
                const sel = e.selections.find((s) => s.questionId === q.id);
                if (!sel) return null;
                return (
                  <li key={q.id} className="text-[13px] text-foreground/90">
                    <span className="font-semibold">{qi + 1}. </span>
                    <span className="font-semibold text-ok">
                      {sel.letter.toUpperCase()}) {q.options[sel.optionIndex]?.text ?? ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {err && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

        {sendCfg && !sendCfg.enabled && (
          <p className="text-xs text-muted-foreground">{sendCfg.reason}</p>
        )}
        {e.status === "done" && (
          <p className="text-xs text-muted-foreground">{t("send.blockedDone")}</p>
        )}

        {sendOpen && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-sm">
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
              <span>{t("send.stepReview")}</span>
              <span className="text-muted-foreground" aria-hidden>→</span>
              {isUpload && (
                <>
                  <span>{t("send.stepFormat")}</span>
                  <span className="text-muted-foreground" aria-hidden>→</span>
                </>
              )}
              <span>{isUpload ? t("send.stepConfirm3") : t("send.stepConfirm2")}</span>
            </div>
            <div className="flex items-start gap-2 font-semibold text-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>{t("send.warning")}</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-foreground/90">
              <li>
                {isForum
                  ? t("send.howForum")
                  : !isUpload
                    ? e.isSurvey
                      ? t("send.howSurvey")
                      : t("send.howQuiz")
                    : sendMode === "text"
                      ? t("send.howText")
                      : sendMode === "pdf"
                        ? t("send.howPdf")
                        : t("send.howTxt")}
              </li>
              <li>{t("send.irreversible")}</li>
              <li>{t("send.check")}</li>
            </ul>

            {isUpload && (
              <div className="mt-3">
                <div className="mb-1.5 text-[13px] font-medium text-foreground">{t("send.formatTitle")}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SEND_MODES.map((m) => {
                    const Icon = m.icon;
                    const selected = sendMode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setSendMode(m.value)}
                        disabled={sending}
                        aria-pressed={selected}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[12px] transition-colors",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          selected
                            ? "border-brand/60 bg-brand/15 text-foreground"
                            : "border-border bg-muted/30 text-muted-foreground hover:bg-accent/40",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {t(m.labelKey)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {(() => {
                    const m = SEND_MODES.find((x) => x.value === sendMode);
                    return m ? t(m.hintKey) : "";
                  })()}
                </p>

                {(sendMode === "txt" || sendMode === "pdf") && (
                  <>
                    <div className="mt-2 flex items-center gap-2">
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
                        className="mt-2 h-72 w-full rounded-md border border-border bg-white"
                      />
                    )}
                    {previewText != null && (
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2.5 text-[12px] leading-relaxed">
                        {previewText}
                      </pre>
                    )}
                  </>
                )}
              </div>
            )}

            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand"
                checked={agree}
                onChange={(ev) => setAgree(ev.target.checked)}
              />
              <span>{t("send.agree")}</span>
            </label>
            {sendErr && (
              <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{sendErr}</p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSendOpen(false)} disabled={sending}>
                {t("send.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => void confirmSend()}
                disabled={!agree || sending || (wantsText ? !draft.trim() : e.selections.length === 0)}
              >
                {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {sending ? t("send.sending") : t("send.confirm")}
              </Button>
            </div>
          </div>
        )}

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
              {t("subs.title", { n: subs.length })}
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
                    {s.mode && <span className="text-muted-foreground"> · {sendModeLabel(s.mode, t)}</span>}
                    {s.attachmentName && <span className="text-muted-foreground"> · {s.attachmentName}</span>}
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

function FilePreview({ file }: { file: RemoteFile }) {
  const name = remoteFileName(file);
  const office = isOffice(file);
  const { t } = useT();
  const [state, setState] = useState<"loading" | "ready" | "error">(office ? "loading" : "ready");

  useEffect(() => {
    if (!office) return;
    let cancelled = false;
    fetch(previewUrl(file), { method: "HEAD" })
      .then((r) => {
        if (!cancelled) setState(r.ok ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [file, office]);

  if (office && state === "error") {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="text-xs text-muted-foreground">{t("files.previewUnavailable")}</span>
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/40">
      <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-sm">
        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 text-xs text-brand underline-offset-4 hover:underline"
        >
          {t("files.open")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      {office && state === "loading" ? (
        <div className="flex h-[28rem] w-full items-center justify-center gap-2 bg-white text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("files.converting")}
        </div>
      ) : (
        <iframe src={previewUrl(file)} title={name} loading="lazy" className="h-[28rem] w-full bg-white" />
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-[28rem] rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

function ForumThreadPost({ post, depth = 0 }: { post: ForumPost; depth?: number }) {
  const { t, locale } = useT();
  const text = stripHtml(post.html);
  if (post.isDeleted || !text) return null;
  const isStaff = post.postOwnerSafeaRole != null && post.postOwnerSafeaRole !== "student";
  return (
    <li className={cn(depth > 0 && "ml-4 border-l border-border/60 pl-3")}>
      <div className="rounded-md border border-border bg-muted/25 p-3">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className={cn("font-semibold", isStaff ? "text-brand" : "text-foreground/80")}>
            {post.postOwnerUsername}
          </span>
          {isStaff && <span className="text-[10px] font-medium text-brand">{post.postOwnerRoleName ?? post.postOwnerSafeaRole}</span>}
          <span>{fmtVersionDate(post.createdAt, locale)}</span>
          {post.isEdited && <span className="text-[10px] italic">{t("forum.edited")}</span>}
          {post.enrollmentIdsWhoLiked.length > 0 && (
            <span className="text-[10px]">♥ {post.enrollmentIdsWhoLiked.length}</span>
          )}
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{text}</p>
      </div>
      {post.children.length > 0 && (
        <ul className="mt-2 space-y-2">
          {post.children.map((c) => (
            <ForumThreadPost key={c.id} post={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ForumThread({ forum }: { forum: ForumInfo }) {
  const { t } = useT();
  return (
    <CollapsibleCard
      id="forum"
      icon={<MessagesSquare className="size-4 shrink-0 text-brand" aria-hidden />}
      title={t("forum.title")}
      badge={
        <span className="text-xs font-normal text-muted-foreground">
          {t("forum.count", { n: forum.countPosts })}
        </span>
      }
      bodyClassName="space-y-2 p-4"
    >
      {forum.posts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          {forum.countPosts > 0 ? t("forum.notLoaded") : t("forum.firstPost")}
        </p>
      ) : (
        <ul className="space-y-2">
          {forum.posts.map((p) => (
            <ForumThreadPost key={p.id} post={p} />
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}

export function ExercisePage() {
  const { id } = useParams();
  const { items, loading, error, reload, refresh } = useAppData();
  const navigate = useNavigate();
  const { t, locale } = useT();
  const [params, setParams] = useSearchParams();
  const [regenToken, setRegenToken] = useState(0);
  const [focus, setFocus] = useState(false);
  const headerCard = useCardCollapse("resumo");

  const exerciseId = Number(id);
  const e = items.find((x) => x.id === exerciseId) ?? null;
  const wantsAuto = params.get("gerar") === "1";

  useEffect(() => {
    if (!items.length && loading) return;
    if (!e && !loading && !error) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, items.length, loading, error]);

  useEffect(() => {
    if (wantsAuto && e) setParams({}, { replace: true });
  }, [wantsAuto, e, setParams]);

  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  if (loading && items.length === 0) {
    return <DetailSkeleton />;
  }

  if (!e && !loading) {
    return (
      <div className="p-4">
        <NoData
          title={t("exercise.notFoundTitle")}
          detail={error ?? t("exercise.notFoundDetail")}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              {t("exercise.backToPanel")}
            </Button>
          }
        />
      </div>
    );
  }
  if (!e) return null;

  const meta = kindMeta(e.kind);

  return (
    <div className="p-4">
      <BackLink />
      <div
        className={cn(
          "mt-2 grid gap-4 xl:items-start",
          focus ? "" : "xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
        )}
      >
        {/* left column: enunciado, arquivos, questões (hidden in focus mode, stays mounted) */}
        <div className={cn("min-w-0 space-y-4", focus && "hidden")}>
          <header className="overflow-hidden rounded-xl border border-border bg-card">
            <div className={cn("flex flex-wrap items-center gap-2 p-5", headerCard.open && "pb-0")}>
              <TypeBadge kind={e.kind} contentKind={e.contentKind} isSurvey={e.isSurvey} />
              {e.done && <DoneBadge />}
              <StatusBadge e={e} />
              {e.deadlineAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" aria-hidden />
                  {t("exercise.deadline", { d: fmtDeadline(e.deadlineAt, locale) })}
                </span>
              )}
              <span className="ml-auto" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFocus(true)}
                title={t("exercise.focusTitle")}
                aria-pressed={false}
              >
                <Maximize2 aria-hidden />
                {t("exercise.focusMode")}
              </Button>
              <a
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("mark.openPortal")}
                <ExternalLink className="size-3" aria-hidden />
              </a>
              <CollapseButton open={headerCard.open} onToggle={headerCard.toggle} label={t("exercise.collapseDetails")} />
            </div>
            {headerCard.open && (
              <div className="space-y-3 p-5 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-heading text-xl font-semibold leading-snug text-balance">{e.title}</h1>
                  {e.done && <DoneBadge />}
                </div>
                <AccChips professorId={e.professorId} professor={e.professor} moduleName={e.moduleName} />
                {e.sectionTitle && <p className="mt-1 text-xs text-muted-foreground">{e.sectionTitle}</p>}
              </div>
            )}
          </header>

          {e.instructionsText && (
            <CollapsibleCard id="enunciado" title={t("exercise.instructions")} bodyClassName="p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{e.instructionsText}</p>
            </CollapsibleCard>
          )}

          {e.forum && <ForumThread forum={e.forum} />}

          {e.remoteFiles.length > 0 && (
            <CollapsibleCard
              id="arquivos"
              title={t("exercise.files")}
              badge={<span className="text-xs font-normal text-muted-foreground">({e.remoteFiles.length})</span>}
              bodyClassName="flex flex-col gap-3 p-4"
            >
              {e.remoteFiles.map((f) => (
                <FilePreview key={f.url} file={f} />
              ))}
            </CollapsibleCard>
          )}

          {e.kind === "quiz" && e.questions.length > 0 && (
            <CollapsibleCard
              id="questoes"
              title={t("exercise.questions")}
              badge={<span className="text-xs font-normal text-muted-foreground">({e.questions.length})</span>}
              bodyClassName="space-y-2 p-4"
            >
              {e.questions.map((q, qi) => {
                const sel = e.selections.find((s) => s.questionId === q.id);
                return (
                  <div key={q.id} className="rounded-md border border-border bg-muted/25 p-3">
                    <div className="mb-1 inline-flex size-5 items-center justify-center rounded-full bg-brand/20 text-[11px] font-bold text-brand">
                      {qi + 1}
                    </div>
                    <p className="text-sm leading-relaxed">{q.text}</p>
                    <div className="mt-1.5 space-y-0.5">
                      {q.options.map((o, i) => {
                        const chosen = sel?.optionIndex === i;
                        return (
                          <div
                            key={o.id || i}
                            className={cn(
                              "flex items-center gap-1.5 rounded px-1 text-[13px]",
                              chosen ? "font-semibold text-ok" : "text-muted-foreground",
                            )}
                          >
                            <span className={cn("font-semibold", chosen ? "text-ok" : "text-foreground/70")}>
                              {String.fromCharCode(97 + i)})
                            </span>
                            <span>{o.text}</span>
                            {chosen && <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CollapsibleCard>
          )}

          {meta.canAnswer && <AiRequestPanel e={e} onSaved={() => setRegenToken((t) => t + 1)} />}
        </div>

        {/* right column: answer workbench / completion panel */}
        <div className={cn("min-w-0", !focus && "xl:sticky xl:top-[4.5rem] xl:h-[calc(100vh-6rem)]")}>
          {focus && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-brand" aria-hidden />
                {t("exercise.focusOn")}
              </span>
              <Button variant="outline" size="sm" onClick={() => setFocus(false)}>
                <Minimize2 aria-hidden />
                {t("exercise.focusOff")}
              </Button>
            </div>
          )}
          {meta.canAnswer ? (
            <AnswerPanel key={e.id} e={e} onRefresh={onRefresh} autoGenerate={wantsAuto} regenToken={regenToken} />
          ) : meta.canMark ? (
            <MarkPanel key={e.id} e={e} onRefresh={onRefresh} />
          ) : (
            <PortalOnlyPanel e={e} />
          )}
        </div>
      </div>
    </div>
  );
}

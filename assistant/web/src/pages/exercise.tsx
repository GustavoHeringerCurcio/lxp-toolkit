import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Copy,
  Download,
  ExternalLink,
  History,
  Loader2,
  Paperclip,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  clearAnswerHistory,
  fetchAnswerState,
  fetchSendConfig,
  fetchSubmission,
  fmtVersionDate,
  restoreAnswerVersion,
  saveManualAnswer,
  sendAnswerToPortal,
  snippet,
  streamGenerate,
  type SendConfigDto,
  type SubmissionDto,
} from "@/api";
import { useAppData } from "@/lib/app-state";
import { fmtDeadline } from "@/lib/status";
import { cn } from "@/lib/utils";
import { isPdf, remoteFileName } from "@/lib/files";
import type { AnswerState, Exercise } from "@/types";
import { BackLink } from "@/components/app-sidebar";
import { CollapseButton, CollapsibleCard, useCardCollapse } from "@/components/collapsible-card";
import { AccChips } from "@/components/prof-chip";
import { AiRequestPanel } from "@/components/ai-request-panel";
import { StatusBadge, TypeBadge } from "@/components/status-badges";
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
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sub, setSub] = useState<SubmissionDto | null>(null);
  const cancelRef = useRef(false);
  const busyRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    setDraft(e.answer ?? "");
    setErr(null);
    setSendOpen(false);
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
  }, [e.id, e.answer]);

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

  const setBusySync = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

  const generate = async () => {
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
        if (ev.type === "done") setState({ current: ev.current ?? null, history: ev.history ?? [] });
      });
      setState(st);
      onRefresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
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

  const confirmSend = async () => {
    setSending(true);
    setSendErr(null);
    cancelRef.current = false;
    setSub({ status: "running", detail: "Abrindo sessão no portal…", at: new Date().toISOString() });
    try {
      const started = await sendAnswerToPortal(e.id, draft);
      setSub(started);
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 2_500));
        const cur = await fetchSubmission(e.id);
        if (cur && cur.status !== "running") {
          setSub(cur);
          break;
        }
      }
      onRefresh();
    } catch (x) {
      setSendErr(x instanceof Error ? x.message : String(x));
      setSub(null);
    } finally {
      setSending(false);
      setSendOpen(false);
      cancelRef.current = true;
    }
  };

  const isUpload = e.kind === "upload";
  const canSend = isUpload && e.status !== "done" && Boolean(sendCfg?.enabled) && Boolean(draft.trim()) && !sending;

  return (
    <CollapsibleCard
      id="resposta"
      icon={<Sparkles className="size-4 shrink-0 text-brand" aria-hidden />}
      title="Resposta"
      className="xl:flex xl:h-full xl:min-h-0 xl:flex-col data-[open=false]:xl:h-auto"
      bodyClassName="flex-1 min-h-0 space-y-3 overflow-y-auto p-4"
      badge={
        <>
          {current && (
            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              salvo {fmtVersionDate(current.updatedAt)} · {current.source === "ai" ? "IA" : "manual"}
            </span>
          )}
          {e.status === "done" && (
            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">concluída no portal</span>
          )}
        </>
      }
      actions={
        (current || sortedHistory.length > 0) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="xs" className="gap-1.5" aria-label="histórico de versões" />}
            >
              <History />
              Histórico {sortedHistory.length > 0 && `(${sortedHistory.length})`}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64 max-w-xs">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Versões anteriores</DropdownMenuLabel>
                {sortedHistory.length === 0 && (
                  <DropdownMenuItem disabled>Nenhuma versão anterior — gere de novo para acumular.</DropdownMenuItem>
                )}
                {sortedHistory.map((h, i) => {
                  const realIndex = history.findIndex((x) => x.updatedAt === h.updatedAt);
                  return (
                    <DropdownMenuItem key={h.updatedAt + i} onClick={() => void restore(realIndex)} className="items-start">
                      <Undo2 className="mt-0.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {snippet(h.answer, 46) || "(vazio)"}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {fmtVersionDate(h.updatedAt)} · {h.source === "ai" ? "IA" : "manual"}
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
                      Limpar histórico
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
            {busy ? "Gerando…" : current ? "Regenerar (nova versão)" : "Gerar com IA"}
          </Button>
          <Button variant="outline" size="sm" onClick={save} disabled={busy || !draft.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Salvar resposta
          </Button>
          <Button variant="ghost" size="sm" onClick={copy} disabled={!draft.trim()}>
            <Copy aria-hidden />
            copiar
          </Button>
          {current?.answer && (
            <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={`/api/export/${e.id}`}>
              <Download aria-hidden />
              .md
            </a>
          )}

          {isUpload ? (
            <Button
              variant="default"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setSendErr(null);
                setSendOpen((v) => !v);
              }}
              disabled={!canSend}
            >
              <Send aria-hidden />
              Enviar no portal
            </Button>
          ) : (
            <span className="ml-auto text-xs text-muted-foreground">
              Questionário: responda no portal — aqui você gera e salva o texto.
            </span>
          )}
        </div>
      }
    >
        <Textarea
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          placeholder={
            isUpload
              ? "Escreva a resposta para entregar — ou gere com a IA e revise antes de enviar."
              : "Gere aqui o texto com as respostas do questionário e copie para o portal."
          }
          rows={6}
          className="min-h-36 field-sizing-fixed leading-relaxed"
        />

        {err && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

        {isUpload && sendCfg && !sendCfg.enabled && (
          <p className="text-xs text-muted-foreground">{sendCfg.reason}</p>
        )}
        {isUpload && e.status === "done" && (
          <p className="text-xs text-muted-foreground">Esta atividade já foi concluída — envio bloqueado.</p>
        )}

        {isUpload && sendOpen && (
          <div className="rounded-lg border border-brand/30 bg-brand/10 p-3.5 text-sm">
            <div className="flex items-start gap-2 font-semibold text-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>Você está prestes a enviar para o portal de verdade.</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-foreground/90">
              <li>Sua conta LXP abre e o texto acima é anexado como arquivo e entregue.</li>
              <li>A ação não é reversível e pode consumir uma tentativa.</li>
              <li>Confira o texto e o prazo antes de confirmar.</li>
            </ul>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand"
                checked={agree}
                onChange={(ev) => setAgree(ev.target.checked)}
              />
              <span>Confirmo que quero enviar esta resposta para o LXP agora.</span>
            </label>
            {sendErr && (
              <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{sendErr}</p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSendOpen(false)} disabled={sending}>
                Cancelar
              </Button>
              <Button variant="default" size="sm" onClick={confirmSend} disabled={!agree || sending || !draft.trim()}>
                {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {sending ? "Enviando… (login no portal)" : "Confirmar e enviar"}
              </Button>
            </div>
          </div>
        )}

        {sub && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border p-3 text-sm",
              sub.status === "ok" && "border-ok/40 bg-ok/10 text-ok",
              sub.status === "failed" && "border-destructive/40 bg-destructive/10 text-destructive",
              sub.status === "unknown" && "border-soon/40 bg-soon/10 text-soon",
              sub.status === "running" && "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {sub.status === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <div className="min-w-0">
              <div className="font-semibold">
                {sub.status === "ok" && "Resposta enviada com sucesso."}
                {sub.status === "failed" && "Não foi possível enviar."}
                {sub.status === "unknown" && "Envio feito, mas sem confirmação do portal."}
                {sub.status === "running" && "Enviando…"}
              </div>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">{sub.detail}</p>
            </div>
          </div>
        )}
    </CollapsibleCard>
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

export function ExercisePage() {
  const { id } = useParams();
  const { items, loading, error, reload, refresh } = useAppData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [regenToken, setRegenToken] = useState(0);
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
          title="Atividade não encontrada"
          detail={error ?? "Esse exercício não existe (ou o índice mudou)."}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Voltar para o painel
            </Button>
          }
        />
      </div>
    );
  }
  if (!e) return null;

  const isUpload = e.kind === "upload";

  return (
    <div className="p-4">
      <BackLink />
      <div className="mt-2 grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start">
        {/* left column: enunciado, arquivos, questões */}
        <div className="space-y-4 min-w-0">
          <header className="overflow-hidden rounded-xl border border-border bg-card">
            <span className="pointer-events-none block h-0.5 bg-gradient-to-r from-brand via-brand-2 to-teal" aria-hidden />
            <div className={cn("flex flex-wrap items-center gap-2 p-5", headerCard.open && "pb-0")}>
              <TypeBadge kind={e.kind} />
              <StatusBadge e={e} />
              {e.deadlineAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" aria-hidden />
                  prazo {fmtDeadline(e.deadlineAt)}
                </span>
              )}
              <span className="ml-auto" />
              <a
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`}
                target="_blank"
                rel="noreferrer"
              >
                abrir no portal
                <ExternalLink className="size-3" aria-hidden />
              </a>
              <CollapseButton open={headerCard.open} onToggle={headerCard.toggle} label="Recolher detalhes" />
            </div>
            {headerCard.open && (
              <div className="space-y-3 p-5 pt-3">
                <h1 className="font-heading text-xl font-semibold leading-snug text-balance">{e.title}</h1>
                <AccChips professor={e.professor} moduleName={e.moduleName} />
                {e.sectionTitle && <p className="mt-1 text-xs text-muted-foreground">{e.sectionTitle}</p>}
              </div>
            )}
          </header>

          {e.instructionsText && (
            <CollapsibleCard id="enunciado" title="Enunciado" bodyClassName="p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{e.instructionsText}</p>
            </CollapsibleCard>
          )}

          {e.remoteFiles.length > 0 && (
            <CollapsibleCard
              id="arquivos"
              title="Arquivos"
              badge={<span className="text-xs font-normal text-muted-foreground">({e.remoteFiles.length})</span>}
              bodyClassName="flex flex-col gap-3 p-4"
            >
              {e.remoteFiles.map((f) => {
                const name = remoteFileName(f);
                return isPdf(f) ? (
                  <div key={f.url} className="overflow-hidden rounded-md border border-border bg-muted/40">
                    <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-sm">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 text-xs text-brand underline-offset-4 hover:underline"
                      >
                        abrir
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </div>
                    <iframe src={f.url} title={name} loading="lazy" className="h-[28rem] w-full bg-white" />
                  </div>
                ) : (
                  <a
                    key={f.url}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="text-xs text-muted-foreground">abrir</span>
                  </a>
                );
              })}
            </CollapsibleCard>
          )}

          {!isUpload && e.questions.length > 0 && (
            <CollapsibleCard
              id="questoes"
              title="Questões"
              badge={<span className="text-xs font-normal text-muted-foreground">({e.questions.length})</span>}
              bodyClassName="space-y-2 p-4"
            >
              {e.questions.map((q, qi) => (
                <div key={q.id} className="rounded-md border border-border bg-muted/25 p-3">
                  <div className="mb-1 inline-flex size-5 items-center justify-center rounded-full bg-brand/20 text-[11px] font-bold text-brand">
                    {qi + 1}
                  </div>
                  <p className="text-sm leading-relaxed">{q.text}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {q.options.map((o, i) => (
                      <div key={i} className="pl-1 text-[13px] text-muted-foreground">
                        <span className="mr-1.5 font-semibold text-foreground/70">{String.fromCharCode(97 + i)})</span>
                        {o}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CollapsibleCard>
          )}

          <AiRequestPanel e={e} onSaved={() => setRegenToken((t) => t + 1)} />
        </div>

        {/* right column: answer workbench */}
        <div className="min-w-0 xl:sticky xl:top-[4.5rem] xl:h-[calc(100vh-6rem)]">
          <AnswerPanel key={e.id} e={e} onRefresh={onRefresh} autoGenerate={wantsAuto} regenToken={regenToken} />
        </div>
      </div>
    </div>
  );
}

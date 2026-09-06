import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Paperclip,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import {
  fetchSendConfig,
  generateAnswer,
  saveManualAnswer,
  sendAnswerToPortal,
  fetchSubmission,
  type AiConfigDto,
  type SendConfigDto,
  type SubmissionDto,
} from "@/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fmtDeadline } from "@/lib/status";
import type { Exercise } from "@/types";
import { AccChips } from "./prof-chip";
import { StatusBadge, TypeBadge } from "./status-badges";

interface Props {
  e: Exercise;
  cfg: AiConfigDto | null;
  onNote: (notes: string) => void;
  onReload: () => void;
}

export function ActivityDetail({ e, cfg, onNote, onReload }: Props) {
  const [notes, setNotes] = useState(e.notes);
  const [draft, setDraft] = useState(e.answer ?? "");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sendCfg, setSendCfg] = useState<SendConfigDto | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const [sub, setSub] = useState<SubmissionDto | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => setNotes(e.notes), [e.notes]);
  useEffect(() => {
    setDraft(e.answer ?? "");
    setSendOpen(false);
    setAgree(false);
    setSub(null);
    setSendErr(null);
    cancelRef.current = false;
    fetchSendConfig().then(setSendCfg);
  }, [e.id]);
  // keep an up-to-date exercise id in the ref so long polls don't cross tasks
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, [e.id]);

  const generate = async () => {
    setAiBusy(true);
    setErr(null);
    try {
      const { answer } = await generateAnswer(e.id);
      setDraft(answer);
      onReload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await saveManualAnswer(e.id, draft);
      onReload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (draft) await navigator.clipboard.writeText(draft);
  };

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
      onReload();
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
    <div className="flex h-full flex-col gap-4">
      <Card className="relative overflow-hidden">
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand via-brand-2 to-teal"
          aria-hidden
        />
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
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
          </div>

          <div>
            <h2 className="font-heading text-xl font-semibold leading-snug">{e.title}</h2>
            <AccChips professor={e.professor} moduleName={e.moduleName} className="mt-2" />
            {e.sectionTitle && <p className="mt-1 text-xs text-muted-foreground">{e.sectionTitle}</p>}
          </div>

          {e.instructionsText && (
            <>
              <Separator />
              <div>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Enunciado
                </h3>
                <p className="text-sm leading-relaxed text-foreground/90">{e.instructionsText}</p>
              </div>
            </>
          )}

          {e.files.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Arquivos
                </h3>
                <div className="flex flex-col gap-1.5">
                  {e.files.map((f) => (
                    <a
                      key={f.name}
                      href={`/docs/${f.relPath.replace(/^docs\//, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name.replace(/^\d+_/, "")}</span>
                      <span className="text-xs text-muted-foreground">abrir</span>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}

          {e.kind === "quiz" && e.questions.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Questões ({e.questions.length})
                </h3>
                <div className="space-y-2">
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
                </div>
              </div>
            </>
          )}

          <Separator />
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Suas anotações
            </h3>
            <Textarea
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              placeholder="Contexto para a IA (opcional)…"
              rows={3}
            />
            <div className="mt-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => onNote(notes)}>
                salvar nota
              </Button>
            </div>
          </div>

          <Separator />
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resposta</h3>
              {cfg && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">modelo {cfg.model}</span>}
              {e.status === "done" && (
                <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-medium text-ok">concluída no portal</span>
              )}
            </div>

            <Textarea
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              placeholder="Escreva aqui a resposta que quer entregar — ou gere com a IA e revise antes de enviar."
              rows={8}
              className="leading-relaxed"
            />
            {err && <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={generate} disabled={aiBusy}>
                {aiBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {aiBusy ? "Gerando…" : "Gerar com IA"}
              </Button>
              <Button variant="outline" size="sm" onClick={save} disabled={saving || !draft.trim()}>
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                Salvar resposta
              </Button>

              {e.answer ? (
                <>
                  <Button variant="ghost" size="sm" onClick={copy}>
                    <Copy aria-hidden />
                    copiar
                  </Button>
                  <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={`/api/export/${e.id}`}>
                    <Download aria-hidden />
                    baixar .md
                  </a>
                </>
              ) : null}

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
                  Questionário: responda no portal — aqui você pode gerar e salvar o texto.
                </span>
              )}
            </div>

            {isUpload && sendCfg && !sendCfg.enabled && (
              <p className="mt-2 text-xs text-muted-foreground">{sendCfg.reason}</p>
            )}

            {isUpload && e.status === "done" && (
              <p className="mt-2 text-xs text-muted-foreground">Esta atividade já foi concluída — envio bloqueado.</p>
            )}

            {isUpload && sendOpen && (
              <div className="mt-3 rounded-lg border border-brand/30 bg-brand/10 p-3.5 text-sm">
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
                  <Button
                    variant="default"
                    size="sm"
                    onClick={confirmSend}
                    disabled={!agree || sending || !draft.trim()}
                  >
                    {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                    {sending ? "Enviando… (login no portal)" : "Confirmar e enviar"}
                  </Button>
                </div>
              </div>
            )}

            {sub && (
              <div
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-md border p-3 text-sm",
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

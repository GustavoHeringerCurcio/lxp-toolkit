import { useEffect, useState } from "react";
import { generateAnswer } from "@/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { AiConfigDto } from "@/api";
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setNotes(e.notes), [e.notes]);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      await generateAnswer(e.id);
      onReload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (e.answer) await navigator.clipboard.writeText(e.answer);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge kind={e.kind} />
            <StatusBadge e={e} />
            {e.deadlineAt && (
              <span className="text-xs text-muted-foreground">prazo {e.deadlineAt.slice(0, 16)}</span>
            )}
            <span className="ml-auto" />
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`}
              target="_blank"
              rel="noreferrer"
            >
              abrir no portal ↗
            </a>
          </div>

          <div>
            <h2 className="text-xl font-semibold leading-snug">{e.title}</h2>
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
                      <span className="text-base">📎</span>
                      <span className="min-w-0 flex-1 truncate">{f.name.replace(/^\d+_/, "")}</span>
                      <span className="text-xs text-muted-foreground">abrir ↗</span>
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
                      <div className="mb-1 inline-flex size-5 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
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
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Resposta gerada por IA
              </h3>
              {cfg && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{cfg.model}</span>
              )}
            </div>

            {err && <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

            {e.answer ? (
              <>
                <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-[13px] leading-relaxed">
                  {e.answer}
                </pre>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copy}>
                    copiar
                  </Button>
                  <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/export/${e.id}`}>
                    baixar .md ↓
                  </a>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
            )}

            <Button className="mt-3 w-full" onClick={generate} disabled={busy}>
              {busy ? "Gerando…" : "Gerar resposta (pt-BR)"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

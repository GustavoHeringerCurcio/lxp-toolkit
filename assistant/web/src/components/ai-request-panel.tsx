import { useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, Check, Eye, Loader2, RotateCcw, Save, SlidersHorizontal, Sparkles, Wand2, X } from "lucide-react";
import { deleteAiTemplate, saveAiTemplate, saveMessageTemplate } from "@/api";
import { useAppData } from "@/lib/app-state";
import { DEFAULT_MESSAGE_TEMPLATE, PLACEHOLDERS, renderPreviewMessage } from "@/lib/prompt-preview";
import { useLocalStorage } from "@/lib/use-local-storage";
import type { Exercise } from "@/types";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AiRequestPanel({ e, onSaved }: { e: Exercise; onSaved?: () => void }) {
  const { cfg, patchConfig } = useAppData();
  const profile = cfg?.profile ?? { nome: "", matricula: "" };
  const [text, setText] = useState(() => cfg?.message_template || DEFAULT_MESSAGE_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [showAdvanced, setShowAdvanced] = useLocalStorage("lxp.tarefa.ai.more-options", false);

  useEffect(() => {
    setText(cfg?.message_template || DEFAULT_MESSAGE_TEMPLATE);
  }, [cfg?.message_template]);

  const templates = cfg?.ai_templates ?? {};
  const templateNames = Object.keys(templates);

  const insertPlaceholder = (token: string) => {
    const start = Math.min(sel.start, text.length);
    const end = Math.min(sel.end, text.length);
    const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
    setText(next);
    setSel({ start: start + token.length, end: start + token.length });
  };

  const saveGlobal = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (!text.trim()) {
        setErr("Escreva a mensagem antes de salvar.");
        return;
      }
      await saveMessageTemplate(text);
      patchConfig({ message_template: text });
      setMsg("Salvo. Gerando nova resposta…");
      onSaved?.();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const restoreDefault = () => {
    setText(DEFAULT_MESSAGE_TEMPLATE);
    setMsg(null);
    setErr(null);
  };

  const saveAsTemplate = async () => {
    const name = templateName.trim();
    setTplBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (!name) {
        setErr("Dê um nome ao template.");
        return;
      }
      if (!text.trim()) {
        setErr("Escreva a mensagem antes de salvar o template.");
        return;
      }
      const next = await saveAiTemplate(name, text);
      patchConfig({ ai_templates: next });
      setTemplateName("");
      setMsg(`Template "${name}" salvo.`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setTplBusy(false);
    }
  };

  const removeTemplate = async (name: string) => {
    setTplBusy(true);
    setErr(null);
    try {
      const next = await deleteAiTemplate(name);
      patchConfig({ ai_templates: next });
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setTplBusy(false);
    }
  };

  const previewText = showPreview ? renderPreviewMessage(text, e, profile) : "";

  return (
    <CollapsibleCard
      id="ai-request"
      icon={<Wand2 className="size-4 shrink-0 text-brand" aria-hidden />}
      title="O que a IA recebe"
      badge={
        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          todas as atividades
        </span>
      }
      bodyClassName="space-y-3 p-4"
    >
        <Textarea
          value={text}
          onChange={(ev) => {
            setText(ev.target.value);
            setSel({ start: ev.target.selectionStart ?? ev.target.value.length, end: ev.target.selectionEnd ?? ev.target.value.length });
            setMsg(null);
          }}
          onSelect={(ev) => setSel({ start: ev.currentTarget.selectionStart ?? 0, end: ev.currentTarget.selectionEnd ?? 0 })}
          onClick={(ev) => setSel({ start: ev.currentTarget.selectionStart ?? 0, end: ev.currentTarget.selectionEnd ?? 0 })}
          onKeyUp={(ev) => setSel({ start: ev.currentTarget.selectionStart ?? 0, end: ev.currentTarget.selectionEnd ?? 0 })}
          rows={6}
          placeholder="Diga à IA como escrever a resposta desta atividade…"
          aria-label="Prompt enviado para a IA"
          className="min-h-28 leading-relaxed"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={saveGlobal} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Salvar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)} aria-pressed={showAdvanced}>
            <SlidersHorizontal aria-hidden />
            {showAdvanced ? "menos opções" : "mais opções"}
          </Button>
          <span className="ml-auto flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-[11px] text-muted-foreground">modelo {cfg?.model}</span>
          </span>
        </div>

        {msg && (
          <p className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-xs text-ok">
            <Check className="size-3.5" aria-hidden /> {msg}
          </p>
        )}
        {err && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{err}</p>}

        {showAdvanced && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Esta é a mensagem inteira enviada ao modelo. Os marcadores abaixo são substituídos pelo conteúdo da
              atividade no momento do envio.
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              {PLACEHOLDERS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertPlaceholder(token)}
                  className="rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] text-brand transition-colors hover:bg-brand/20"
                  title="inserir marcador na posição do cursor"
                >
                  {token}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={restoreDefault} disabled={busy}>
                <RotateCcw aria-hidden />
                Restaurar padrão
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplates((v) => !v)}
                aria-pressed={showTemplates}
                title="templates salvos"
              >
                <Bookmark aria-hidden />
                Templates
                {templateNames.length > 0 && (
                  <span className="rounded-full bg-brand/15 px-1.5 text-[10px] font-semibold text-brand">
                    {templateNames.length}
                  </span>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
                <Eye aria-hidden />
                {showPreview ? "esconder prévia" : "ver prévia"}
              </Button>
            </div>

            {showTemplates && (
              <div className="space-y-2.5 rounded-lg border border-border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Templates salvos</p>
                {templateNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {templateNames.map((name) => (
                      <span
                        key={name}
                        className="group inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs transition-colors hover:border-brand/40"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setText(templates[name]);
                            setMsg(null);
                            setErr(null);
                          }}
                          className="max-w-40 truncate text-foreground/80 transition-colors group-hover:text-brand"
                          title="usar este template"
                        >
                          {name}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeTemplate(name)}
                          disabled={tplBusy}
                          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          title="remover template"
                          aria-label={`remover template ${name}`}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum template ainda. Salve a mensagem atual com um nome para reutilizar depois.
                  </p>
                )}
                <div className="flex gap-2">
                  <Input
                    value={templateName}
                    onChange={(ev) => setTemplateName(ev.target.value)}
                    placeholder="nome do template (ex.: objetivo, dissertação)"
                    aria-label="nome do template"
                    className="h-8 min-w-40 flex-1 text-sm"
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") void saveAsTemplate();
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={saveAsTemplate} disabled={tplBusy || !text.trim()}>
                    {tplBusy ? <Loader2 className="animate-spin" aria-hidden /> : <BookmarkPlus aria-hidden />}
                    Salvar como template
                  </Button>
                </div>
              </div>
            )}

            {showPreview && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Prévia da mensagem (papel: user)
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-card p-3 text-[11px] leading-relaxed text-foreground/80">
                  {previewText}
                </pre>
                {e.kind === "upload" && e.files.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    O texto dos PDFs é extraído no servidor e inserido em {"{arquivos}"} no momento do envio.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
    </CollapsibleCard>
  );
}

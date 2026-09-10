import { useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, Check, Eye, Loader2, RotateCcw, Save, Sparkles, Wand2, X } from "lucide-react";
import { deleteAiTemplate, saveAiDefault, saveAiTemplate } from "@/api";
import { useAppData } from "@/lib/app-state";
import { DEFAULT_PROMPT_TEXT, rawToEditableText, renderPromptPreview, textToAiRequest } from "@/lib/prompt-preview";
import type { Exercise } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function AiRequestPanel({ e, onSaved }: { e: Exercise; onSaved?: () => void }) {
  const { cfg, patchConfig } = useAppData();
  const profile = cfg?.profile ?? { nome: "", matricula: "" };
  const [text, setText] = useState(() => rawToEditableText(cfg?.ai_request_default ?? "") || DEFAULT_PROMPT_TEXT);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);

  useEffect(() => {
    setText(rawToEditableText(cfg?.ai_request_default ?? "") || DEFAULT_PROMPT_TEXT);
  }, [cfg?.ai_request_default]);

  const templates = cfg?.ai_templates ?? {};
  const templateNames = Object.keys(templates);

  const moduleLabel = e.moduleTitle + (e.sectionTitle ? ` — ${e.sectionTitle}` : "");

  const saveGlobal = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (!text.trim()) {
        setErr("Escreva o pedido antes de salvar.");
        return;
      }
      await saveAiDefault(text);
      patchConfig({ ai_request_default: text });
      setMsg("Salvo. Gerando nova resposta…");
      onSaved?.();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const restoreDefault = () => {
    setText(DEFAULT_PROMPT_TEXT);
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
        setErr("Escreva o pedido antes de salvar o template.");
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

  const previewText = showPreview
    ? renderPromptPreview({
        kind: e.kind,
        title: e.title,
        moduleLabel,
        hasInstructions: Boolean(e.instructionsText),
        fileCount: e.files.length,
        questionCount: e.questions.length,
        req: textToAiRequest(text),
        profile,
      })
    : "";

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Wand2 className="size-4 shrink-0 text-brand" aria-hidden />
          <h3 className="font-heading text-sm font-semibold">O que a IA recebe</h3>
          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            todas as atividades
          </span>
        </div>
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

      <div className="space-y-3 p-4">
        <Textarea
          value={text}
          onChange={(ev) => {
            setText(ev.target.value);
            setMsg(null);
          }}
          rows={8}
          placeholder="Escreva como a IA deve responder. Use {nome} e {matricula} para citar você."
          aria-label="Pedido enviado para a IA"
          className="min-h-40 text-sm leading-relaxed"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={saveGlobal} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Salvar
          </Button>
          <Button variant="outline" size="sm" onClick={restoreDefault} disabled={busy}>
            <RotateCcw aria-hidden />
            Restaurar padrão
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

        {showTemplates && (
          <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-3">
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
                Nenhum template ainda. Salve o texto atual com um nome para reutilizar depois.
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
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Prévia do prompt
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground/80">
                {previewText}
              </pre>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

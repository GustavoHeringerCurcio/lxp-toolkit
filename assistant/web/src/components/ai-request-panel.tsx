import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Loader2, RotateCcw, Save, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveAiRequest } from "@/api";
import { useAppData } from "@/lib/app-state";
import { tryParseAiRequest, renderPromptPreview } from "@/lib/prompt-preview";
import type { Exercise } from "@/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function AiRequestPanel({ e }: { e: Exercise }) {
  const { cfg, patchExercise } = useAppData();
  const profile = cfg?.profile ?? { nome: "", matricula: "" };
  const [raw, setRaw] = useState(e.aiRequestJson);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setRaw(e.aiRequestJson);
    setMsg(null);
    setErr(null);
  }, [e.id, e.aiRequestJson]);

  const parsed = useMemo(() => tryParseAiRequest(raw), [raw]);
  const moduleLabel = e.moduleTitle + (e.sectionTitle ? ` — ${e.sectionTitle}` : "");

  const save = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (!parsed) {
        setErr("JSON inválido — revise antes de salvar.");
        return;
      }
      const res = await saveAiRequest(e.id, raw);
      patchExercise(e.id, { aiRequestJson: res.aiRequestJson, hasAiOverride: res.hasAiOverride });
      setRaw(res.aiRequestJson);
      setMsg(res.hasAiOverride ? "Pedido personalizado salvo para esta atividade." : "Usando o pedido padrão.");
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const restoreDefault = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await saveAiRequest(e.id, null);
      patchExercise(e.id, { aiRequestJson: res.aiRequestJson, hasAiOverride: false });
      setRaw(res.aiRequestJson);
      setMsg("Personalização removida — voltou ao padrão global.");
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const formatJson = () => {
    if (!parsed) return;
    setRaw(JSON.stringify(parsed, null, 2));
  };

  const personaMissing = !profile.nome.trim() || !profile.matricula.trim();
  const previewText = showPreview && parsed
    ? renderPromptPreview({
        kind: e.kind,
        title: e.title,
        moduleLabel,
        hasInstructions: Boolean(e.instructionsText),
        fileCount: e.files.length,
        questionCount: e.questions.length,
        req: parsed,
        profile,
      })
    : "";

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Wand2 className="size-4 shrink-0 text-brand" aria-hidden />
          <h3 className="font-heading text-sm font-semibold">O que a IA recebe</h3>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              e.hasAiOverride
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-border bg-muted/50 text-muted-foreground",
            )}
            title={e.hasAiOverride ? "Personalizado para esta atividade" : "Padrão global"}
          >
            {e.hasAiOverride ? "personalizado" : "padrão"}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
          <Eye aria-hidden />
          {showPreview ? "esconder prévia" : "ver prévia"}
        </Button>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tudo aqui é enviado para a IA antes do enunciado. Use{" "}
          <code className="rounded bg-muted px-1 font-mono text-[11px] text-brand">{"{nome}"}</code> e{" "}
          <code className="rounded bg-muted px-1 font-mono text-[11px] text-brand">{"{matricula}"}</code> para citar
          você — eles são preenchidos pelo seu perfil (não precisa repetir a cada atividade).
        </p>

        <Textarea
          value={raw}
          onChange={(ev) => {
            setRaw(ev.target.value);
            setMsg(null);
          }}
          rows={12}
          spellCheck={false}
          aria-label="JSON de instruções para a IA"
          className={cn(
            "font-mono text-xs leading-relaxed",
            parsed === null && "border-destructive/60 focus-visible:border-destructive",
          )}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={busy || !raw.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {e.hasAiOverride ? "Salvar alterações" : "Personalizar para esta atividade"}
          </Button>
          {e.hasAiOverride && (
            <Button variant="outline" size="sm" onClick={restoreDefault} disabled={busy}>
              <RotateCcw aria-hidden />
              Restaurar padrão
            </Button>
          )}
          {parsed && e.hasAiOverride && (
            <Button variant="ghost" size="sm" onClick={formatJson} disabled={busy}>
              formatar JSON
            </Button>
          )}
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
        {parsed === null && (
          <p className="text-xs text-destructive">JSON inválido — confira vírgulas e aspas.</p>
        )}

        {personaMissing && (
          <p className="text-[11px] text-muted-foreground">
            Dica: sem nome/matrícula preenchidos, os marcadores ficam vazios. Configure em{" "}
            <span className="text-brand">Perfil & IA</span> no menu lateral.
          </p>
        )}

        {showPreview && parsed && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Prévia do prompt
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground/80">
                {previewText}
              </pre>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

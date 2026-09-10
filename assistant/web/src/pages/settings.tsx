import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, Save, SlidersHorizontal, Wand2 } from "lucide-react";
import { saveActivityTemplate, saveAiConfig } from "@/api";
import { useAppData } from "@/lib/app-state";
import { BackLink } from "@/components/app-sidebar";
import { DEFAULT_ACTIVITY_TEMPLATE, PLACEHOLDERS } from "@/lib/prompt-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SettingsPage() {
  const { cfg, patchConfig } = useAppData();
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [activityTemplate, setActivityTemplate] = useState("");
  const [actSel, setActSel] = useState({ start: 0, end: 0 });
  const [actBusy, setActBusy] = useState(false);
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    setModel(cfg.model);
    setTemperature(String(cfg.temperature ?? ""));
    setMaxTokens(String(cfg.max_output_tokens ?? ""));
    setActivityTemplate(cfg.activity_template || DEFAULT_ACTIVITY_TEMPLATE);
  }, [cfg]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const t = Number(temperature);
      const m = Number(maxTokens);
      if (Number.isNaN(t)) throw new Error("Temperatura inválida.");
      if (Number.isNaN(m) || m <= 0) throw new Error("Máximo de tokens inválido.");
      await saveAiConfig({ model: model.trim(), temperature: t, max_output_tokens: m });
      patchConfig({ model: model.trim(), temperature: t, max_output_tokens: m });
      setMsg("Configurações salvas.");
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const saveActivity = async () => {
    setActBusy(true);
    setActMsg(null);
    setActErr(null);
    try {
      if (!activityTemplate.trim()) throw new Error("Escreva a estrutura antes de salvar.");
      await saveActivityTemplate(activityTemplate);
      patchConfig({ activity_template: activityTemplate });
      setActMsg("Estrutura salva.");
    } catch (x) {
      setActErr(x instanceof Error ? x.message : String(x));
    } finally {
      setActBusy(false);
    }
  };

  const restoreActivity = () => {
    setActivityTemplate(DEFAULT_ACTIVITY_TEMPLATE);
    setActMsg(null);
    setActErr(null);
  };

  const insertPlaceholder = (token: string) => {
    const start = Math.min(actSel.start, activityTemplate.length);
    const end = Math.min(actSel.end, activityTemplate.length);
    const next = `${activityTemplate.slice(0, start)}${token}${activityTemplate.slice(end)}`;
    setActivityTemplate(next);
    setActSel({ start: start + token.length, end: start + token.length });
    setActMsg(null);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
      <BackLink />

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Wand2 className="size-4 text-brand" aria-hidden />
          <h2 className="font-heading text-sm font-semibold">Estrutura da atividade</h2>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            Esta é a parte fixa da mensagem enviada à IA, com o enunciado, os arquivos e as questões da
            atividade. As regras de estilo ("Como escrever") ficam na própria atividade, em "O que a IA recebe".
          </p>

          <Textarea
            value={activityTemplate}
            onChange={(ev) => {
              setActivityTemplate(ev.target.value);
              setActSel({ start: ev.target.selectionStart ?? ev.target.value.length, end: ev.target.selectionEnd ?? ev.target.value.length });
              setActMsg(null);
            }}
            onSelect={(ev) => setActSel({ start: ev.currentTarget.selectionStart ?? 0, end: ev.currentTarget.selectionEnd ?? 0 })}
            onClick={(ev) => setActSel({ start: ev.currentTarget.selectionStart ?? 0, end: ev.currentTarget.selectionEnd ?? 0 })}
            onKeyUp={(ev) => setActSel({ start: ev.currentTarget.selectionStart ?? 0, end: ev.currentTarget.selectionEnd ?? 0 })}
            rows={12}
            aria-label="Estrutura da mensagem enviada à IA"
            className="min-h-56 leading-relaxed"
          />

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
            <Button size="sm" onClick={saveActivity} disabled={actBusy || !activityTemplate.trim()}>
              {actBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Salvar
            </Button>
            <Button variant="outline" size="sm" onClick={restoreActivity} disabled={actBusy}>
              <RotateCcw aria-hidden />
              Restaurar padrão
            </Button>
          </div>

          {actMsg && (
            <p className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-xs text-ok">
              <Check className="size-3.5" aria-hidden /> {actMsg}
            </p>
          )}
          {actErr && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {actErr}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <SlidersHorizontal className="size-4 text-brand" aria-hidden />
          <h2 className="font-heading text-sm font-semibold">Parâmetros de geração</h2>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            Estes parâmetros controlam como o modelo responde. As regras de estilo ficam na atividade, em
            "O que a IA recebe".
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="cfg-model" className="block text-sm font-medium text-foreground/90">
                Modelo
              </label>
              <Input id="cfg-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
            </div>
            <div className="space-y-1">
              <label htmlFor="cfg-temp" className="block text-sm font-medium text-foreground/90">
                Temperatura
              </label>
              <Input
                id="cfg-temp"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cfg-tokens" className="block text-sm font-medium text-foreground/90">
                Máx. tokens
              </label>
              <Input
                id="cfg-tokens"
                type="number"
                min="1"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {busy ? "Salvando…" : "Salvar"}
            </Button>
            {cfg?.configPath && (
              <span className="text-[11px] text-muted-foreground">config: {cfg.configPath}</span>
            )}
          </div>

          {msg && (
            <p className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-xs text-ok">
              <Check className="size-3.5" aria-hidden /> {msg}
            </p>
          )}
          {err && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {err}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

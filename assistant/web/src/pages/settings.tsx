import { useEffect, useState } from "react";
import { Check, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { saveAiConfig } from "@/api";
import { useAppData } from "@/lib/app-state";
import { BackLink } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SettingsPage() {
  const { cfg, patchConfig } = useAppData();
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    setModel(cfg.model);
    setTemperature(String(cfg.temperature ?? ""));
    setMaxTokens(String(cfg.max_output_tokens ?? ""));
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
      <BackLink />
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <SlidersHorizontal className="size-4 text-brand" aria-hidden />
          <h2 className="font-heading text-sm font-semibold">Parâmetros de geração</h2>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            Estes parâmetros controlam como o modelo responde. A mensagem enviada à IA fica na atividade, em
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

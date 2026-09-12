import { useEffect, useState, type ReactNode } from "react";
import { Check, Eye, ListChecks, Loader2, MessageSquareQuote, RotateCcw, Save, SlidersHorizontal, Wand2 } from "lucide-react";
import { saveAiConfig } from "@/api";
import { useAppData } from "@/lib/app-state";
import { BackLink } from "@/components/app-sidebar";
import { DEFAULT_ACTIVITY_SECTIONS, DEFAULT_STYLE, renderStylePreview } from "@/lib/prompt-preview";
import type { AiActivitySections, AiStyle } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground/90">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card/60 p-3 transition-colors hover:border-brand/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(ev) => onChange(ev.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-brand"
      />
      <span>
        <span className="block text-sm font-medium text-foreground/90">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        {icon}
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Feedback({ msg, err }: { msg: string | null; err: string | null }) {
  return (
    <>
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
    </>
  );
}

export function SettingsPage() {
  const { cfg, patchConfig } = useAppData();
  const [style, setStyle] = useState<AiStyle>(DEFAULT_STYLE);
  const [sections, setSections] = useState<AiActivitySections>(DEFAULT_ACTIVITY_SECTIONS);
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    setStyle({ ...DEFAULT_STYLE, ...cfg.style });
    setSections({ ...DEFAULT_ACTIVITY_SECTIONS, ...cfg.activitySections });
    setModel(cfg.model);
    setTemperature(String(cfg.temperature ?? ""));
    setMaxTokens(String(cfg.max_output_tokens ?? ""));
  }, [cfg]);

  const patchStyle = (patch: Partial<AiStyle>) => {
    setStyle((prev) => ({ ...prev, ...patch }));
    setMsg(null);
    setErr(null);
  };

  const patchSections = (patch: Partial<AiActivitySections>) => {
    setSections((prev) => ({ ...prev, ...patch }));
    setMsg(null);
    setErr(null);
  };

  const restoreDefaults = () => {
    setStyle({ ...DEFAULT_STYLE });
    setSections({ ...DEFAULT_ACTIVITY_SECTIONS });
    setMsg(null);
    setErr(null);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const t = Number(temperature);
      const m = Number(maxTokens);
      if (Number.isNaN(t)) throw new Error("Temperatura inválida.");
      if (Number.isNaN(m) || m <= 0) throw new Error("Máximo de tokens inválido.");
      const nextModel = model.trim() || cfg?.model || "gpt-4o";
      await saveAiConfig({
        model: nextModel,
        temperature: t,
        max_output_tokens: m,
        style,
        activitySections: sections,
      });
      patchConfig({ model: nextModel, temperature: t, max_output_tokens: m, style, activitySections: sections });
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

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {busy ? "Salvando…" : "Salvar tudo"}
        </Button>
        <Button variant="outline" size="sm" onClick={restoreDefaults} disabled={busy}>
          <RotateCcw aria-hidden />
          Restaurar padrão
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
          <Eye aria-hidden />
          {showPreview ? "esconder prévia" : "ver prévia"}
        </Button>
      </div>

      <Feedback msg={msg} err={err} />

      <Card icon={<MessageSquareQuote className="size-4 text-brand" aria-hidden />} title="Voz da IA">
        <p className="text-xs text-muted-foreground">
          Isto vira a mensagem de sistema: diz à IA <em>como</em> escrever. O conteúdo da atividade é
          enviado à parte, então a IA não repete os rótulos.
        </p>
        <Field label="Quem a IA está sendo">
          <Input
            value={style.persona}
            onChange={(ev) => patchStyle({ persona: ev.target.value })}
            placeholder="Ex.: Você é o aluno entregando esta atividade."
          />
        </Field>
        <Field label="Tom e idioma" hint="Descreva o estilo de escrita esperado.">
          <Textarea
            value={style.voice}
            onChange={(ev) => patchStyle({ voice: ev.target.value })}
            rows={2}
            className="min-h-16 leading-relaxed"
            placeholder="Ex.: Escreva em português simples e natural, como um estudante."
          />
        </Field>
        <Toggle
          label="Começar com nome e matrícula"
          hint={'"Nome: …" e "Matrícula: …" no topo da resposta.'}
          checked={style.includeIdentity}
          onChange={(v) => patchStyle({ includeIdentity: v })}
        />
      </Card>

      <Card icon={<ListChecks className="size-4 text-brand" aria-hidden />} title="Formato da resposta">
        <Field label="Questões de múltipla escolha">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "letter", label: "Só a letra" },
                { value: "letter_text", label: "Letra + justificativa" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm transition-colors hover:border-brand/40 has-[:checked]:border-brand has-[:checked]:bg-brand/10"
              >
                <input
                  type="radio"
                  name="mcq-mode"
                  checked={style.mcqMode === opt.value}
                  onChange={() => patchStyle({ mcqMode: opt.value })}
                  className="size-4 accent-brand"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Numerar as respostas"
            checked={style.numbering}
            onChange={(v) => patchStyle({ numbering: v })}
          />
          <Toggle
            label="Associação na mesma linha"
            hint="Ex.: 1. item - resposta"
            checked={style.associateInline}
            onChange={(v) => patchStyle({ associateInline: v })}
          />
        </div>
        <Toggle
          label="Sem introdução nem despedida"
          checked={style.noIntroOutro}
          onChange={(v) => patchStyle({ noIntroOutro: v })}
        />
      </Card>

      <Card icon={<Wand2 className="size-4 text-brand" aria-hidden />} title="Regras">
        <Toggle
          label="Não repetir os rótulos da atividade"
          hint="Evita que a IA copie 'Atividade:', 'Enunciado:', 'Questões:' etc."
          checked={style.noMetaLabels}
          onChange={(v) => patchStyle({ noMetaLabels: v })}
        />
        <Field label="Regras extras" hint="Uma regra por linha. Viram itens da lista de regras.">
          <Textarea
            value={style.extraRules}
            onChange={(ev) => patchStyle({ extraRules: ev.target.value })}
            rows={3}
            className="min-h-20 leading-relaxed"
            placeholder={"Ex.:\nUse frases curtas\nNão use listas quando a questão pedir um texto"}
          />
        </Field>
      </Card>

      <Card icon={<SlidersHorizontal className="size-4 text-brand" aria-hidden />} title="Conteúdo enviado">
        <p className="text-xs text-muted-foreground">
          Escolha o que entra na mensagem do usuário, junto com o enunciado da atividade.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            label="Enunciado / instruções"
            checked={sections.enunciado}
            onChange={(v) => patchSections({ enunciado: v })}
          />
          <Toggle
            label="Arquivos anexados"
            checked={sections.arquivos}
            onChange={(v) => patchSections({ arquivos: v })}
          />
          <Toggle
            label="Questões do quiz"
            checked={sections.questoes}
            onChange={(v) => patchSections({ questoes: v })}
          />
          <Toggle
            label="Observações do aluno"
            checked={sections.observacoes}
            onChange={(v) => patchSections({ observacoes: v })}
          />
        </div>
      </Card>

      <Card icon={<SlidersHorizontal className="size-4 text-brand" aria-hidden />} title="Parâmetros de geração">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Modelo">
            <Input value={model} onChange={(ev) => setModel(ev.target.value)} placeholder="gpt-4o" />
          </Field>
          <Field label="Temperatura">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(ev) => setTemperature(ev.target.value)}
            />
          </Field>
          <Field label="Máx. tokens">
            <Input
              type="number"
              min="1"
              value={maxTokens}
              onChange={(ev) => setMaxTokens(ev.target.value)}
            />
          </Field>
        </div>
        {cfg?.configPath && (
          <p className="text-[11px] text-muted-foreground">config: {cfg.configPath}</p>
        )}
      </Card>

      {showPreview && (
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Eye className="size-4 text-brand" aria-hidden />
            <h2 className="font-heading text-sm font-semibold">Prévia da mensagem (system)</h2>
          </div>
          <div className="p-4">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground/80">
              {renderStylePreview(style)}
            </pre>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Os marcadores como {"{nome}"} e {"{atividade}"} são preenchidos no momento do envio.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

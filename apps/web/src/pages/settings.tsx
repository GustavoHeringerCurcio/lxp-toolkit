import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  Camera,
  Eye,
  ListChecks,
  Loader2,
  MessageSquareQuote,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sun,
  UserRound,
  Wand2,
} from "lucide-react";
import { saveAiConfig, saveProfile } from "@/api";
import { useAppData } from "@/lib/app-state";
import { BackLink } from "@/components/app-sidebar";
import { ProfessorPhotoList } from "@/components/professor-photo-list";
import { DEFAULT_ACTIVITY_SECTIONS, DEFAULT_STYLE, renderStylePreview } from "@/lib/prompt-preview";
import {
  ESTIMATED_GENERATION_TOKENS,
  estimateGenerationCostUsd,
  findModel,
  formatUsd,
  groupModels,
} from "@/lib/model-pricing";
import { useT } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";
import type { AiActivitySections, AiProfile, AiStyle } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SettingsTab = "personal" | "ai" | "advanced";

const TABS: SettingsTab[] = ["personal", "ai", "advanced"];

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

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="flex w-fit flex-wrap items-center gap-0.5 rounded-full border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
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

function PriceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-sm tabular-nums text-foreground/90">{value}</p>
    </div>
  );
}

export function SettingsPage() {
  const { cfg, patchConfig } = useAppData();
  const { t, lang, locale, setLang } = useT();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useLocalStorage<SettingsTab>("lxp.settings.tab", "ai");
  const [style, setStyle] = useState<AiStyle>(DEFAULT_STYLE);
  const [sections, setSections] = useState<AiActivitySections>(DEFAULT_ACTIVITY_SECTIONS);
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
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
    setNome(cfg.profile?.nome ?? "");
    setMatricula(cfg.profile?.matricula ?? "");
  }, [cfg]);

  const selectedModel = findModel(model);
  const generationCost = estimateGenerationCostUsd(model);
  const modelGroups = useMemo(() => {
    const groups = groupModels();
    if (model && !selectedModel) {
      return [
        {
          group: t("settings.modelCustom"),
          models: [{ id: model, label: model, group: "custom", input: 0, output: 0 }],
        },
        ...groups,
      ];
    }
    return groups;
  }, [model, selectedModel, t]);

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
      const temp = Number(temperature);
      const maxTok = Number(maxTokens);
      if (Number.isNaN(temp)) throw new Error(t("settings.invalidTemperature"));
      if (Number.isNaN(maxTok) || maxTok <= 0) throw new Error(t("settings.invalidMaxTokens"));
      const nextModel = model.trim() || cfg?.model || "gpt-4o";
      const profile: AiProfile = { nome: nome.trim(), matricula: matricula.trim() };
      await saveAiConfig({
        model: nextModel,
        temperature: temp,
        max_output_tokens: maxTok,
        style,
        activitySections: sections,
      });
      await saveProfile(profile);
      patchConfig({
        model: nextModel,
        temperature: temp,
        max_output_tokens: maxTok,
        style,
        activitySections: sections,
        profile,
      });
      setMsg(t("settings.saved"));
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
          {busy ? t("settings.saving") : t("settings.saveAll")}
        </Button>
        <Button variant="outline" size="sm" onClick={restoreDefaults} disabled={busy}>
          <RotateCcw aria-hidden />
          {t("settings.restore")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
          <Eye aria-hidden />
          {showPreview ? t("common.hidePreview") : t("common.showPreview")}
        </Button>
      </div>

      <div
        role="tablist"
        aria-label={t("settings.tabsAria")}
        className="flex w-fit items-center gap-0.5 rounded-full border bg-card p-1"
      >
        {TABS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t(`settings.tab.${s}`)}
          </button>
        ))}
      </div>

      <Feedback msg={msg} err={err} />

      {tab === "personal" && (
        <>
          <Card icon={<UserRound className="size-4 text-brand" aria-hidden />} title={t("profile.title")}>
            <p className="text-xs text-muted-foreground">{t("profile.desc")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("profile.name")}>
                <Input
                  value={nome}
                  onChange={(ev) => setNome(ev.target.value)}
                  placeholder={t("profile.namePlaceholder")}
                />
              </Field>
              <Field label={t("profile.id")}>
                <Input
                  value={matricula}
                  onChange={(ev) => setMatricula(ev.target.value)}
                  placeholder={t("profile.idPlaceholder")}
                />
              </Field>
            </div>
          </Card>

          <Card icon={<Palette className="size-4 text-brand" aria-hidden />} title={t("settings.appearance")}>
            <p className="text-xs text-muted-foreground">{t("settings.appearanceHint")}</p>
            <Field label={t("settings.themeLabel")}>
              <Segmented<Theme>
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: t("settings.themeLight"), icon: <Sun className="size-3.5" aria-hidden /> },
                  { value: "dark", label: t("settings.themeDark"), icon: <Moon className="size-3.5" aria-hidden /> },
                  {
                    value: "system",
                    label: t("settings.themeSystem"),
                    icon: <Monitor className="size-3.5" aria-hidden />,
                  },
                ]}
              />
            </Field>
            <Field label={t("settings.languageLabel")}>
              <Segmented
                value={lang}
                onChange={setLang}
                options={[
                  { value: "pt", label: t("lang.ptName") },
                  { value: "en", label: t("lang.enName") },
                ]}
              />
            </Field>
          </Card>

          <Card icon={<Camera className="size-4 text-brand" aria-hidden />} title={t("settings.professors")}>
            <p className="text-xs text-muted-foreground">{t("settings.professorsHint")}</p>
            <ProfessorPhotoList />
          </Card>
        </>
      )}

      {tab === "ai" && (
        <>
          <Card icon={<MessageSquareQuote className="size-4 text-brand" aria-hidden />} title={t("settings.voice")}>
            <p className="text-xs text-muted-foreground">
              {t("settings.voiceIntro1")}{" "}
              <em>{t("settings.voiceIntroEm")}</em>{" "}
              {t("settings.voiceIntro2")}
            </p>
            <Field label={t("settings.personaLabel")}>
              <Input
                value={style.persona}
                onChange={(ev) => patchStyle({ persona: ev.target.value })}
                placeholder={t("settings.personaPlaceholder")}
              />
            </Field>
            <Field label={t("settings.voiceLabel")} hint={t("settings.voiceHint")}>
              <Textarea
                value={style.voice}
                onChange={(ev) => patchStyle({ voice: ev.target.value })}
                rows={2}
                className="min-h-16 leading-relaxed"
                placeholder={t("settings.voicePlaceholder")}
              />
            </Field>
            <Toggle
              label={t("settings.identityToggle")}
              hint={t("settings.identityHint")}
              checked={style.includeIdentity}
              onChange={(v) => patchStyle({ includeIdentity: v })}
            />
          </Card>

          <Card icon={<ListChecks className="size-4 text-brand" aria-hidden />} title={t("settings.format")}>
            <Field label={t("settings.mcqLabel")}>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "letter", label: t("settings.mcqLetter") },
                    { value: "letter_text", label: t("settings.mcqLetterText") },
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
                label={t("settings.numbering")}
                checked={style.numbering}
                onChange={(v) => patchStyle({ numbering: v })}
              />
              <Toggle
                label={t("settings.assocInline")}
                hint={t("settings.assocHint")}
                checked={style.associateInline}
                onChange={(v) => patchStyle({ associateInline: v })}
              />
            </div>
            <Toggle
              label={t("settings.noIntroOutro")}
              checked={style.noIntroOutro}
              onChange={(v) => patchStyle({ noIntroOutro: v })}
            />
          </Card>

          <Card icon={<Wand2 className="size-4 text-brand" aria-hidden />} title={t("settings.rules")}>
            <Toggle
              label={t("settings.noMetaLabels")}
              hint={t("settings.noMetaHint")}
              checked={style.noMetaLabels}
              onChange={(v) => patchStyle({ noMetaLabels: v })}
            />
            <Field label={t("settings.extraRules")} hint={t("settings.extraRulesHint")}>
              <Textarea
                value={style.extraRules}
                onChange={(ev) => patchStyle({ extraRules: ev.target.value })}
                rows={3}
                className="min-h-20 leading-relaxed"
                placeholder={t("settings.extraRulesPlaceholder")}
              />
            </Field>
          </Card>

          <Card icon={<SlidersHorizontal className="size-4 text-brand" aria-hidden />} title={t("settings.contentSent")}>
            <p className="text-xs text-muted-foreground">{t("settings.contentSentIntro")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle
                label={t("settings.secInstructions")}
                checked={sections.enunciado}
                onChange={(v) => patchSections({ enunciado: v })}
              />
              <Toggle
                label={t("settings.secFiles")}
                checked={sections.arquivos}
                onChange={(v) => patchSections({ arquivos: v })}
              />
              <Toggle
                label={t("settings.secQuestions")}
                checked={sections.questoes}
                onChange={(v) => patchSections({ questoes: v })}
              />
              <Toggle
                label={t("settings.secNotes")}
                checked={sections.observacoes}
                onChange={(v) => patchSections({ observacoes: v })}
              />
            </div>
          </Card>
        </>
      )}

      {tab === "advanced" && (
        <>
          <Card icon={<SlidersHorizontal className="size-4 text-brand" aria-hidden />} title={t("settings.generation")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label={t("settings.model")}
                hint={!selectedModel && model ? t("settings.modelUnknown") : undefined}
              >
                <Select
                  value={model}
                  aria-label={t("settings.model")}
                  onChange={(ev) => {
                    setModel(ev.target.value);
                    setMsg(null);
                    setErr(null);
                  }}
                >
                  {modelGroups.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                          {m.recommended ? ` · ${t("settings.modelRecommended")}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label={t("settings.temperature")}>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(ev) => setTemperature(ev.target.value)}
                />
              </Field>
              <Field label={t("settings.maxTokens")}>
                <Input
                  type="number"
                  min="1"
                  value={maxTokens}
                  onChange={(ev) => setMaxTokens(ev.target.value)}
                />
              </Field>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <PriceStat
                  label={t("settings.priceInput")}
                  value={selectedModel ? formatUsd(selectedModel.input, locale) : "—"}
                />
                <PriceStat
                  label={t("settings.priceOutput")}
                  value={selectedModel ? formatUsd(selectedModel.output, locale) : "—"}
                />
                <PriceStat
                  label={t("settings.pricePerActivity")}
                  value={generationCost != null ? formatUsd(generationCost, locale) : "—"}
                />
                <PriceStat
                  label={t("settings.pricePer100")}
                  value={generationCost != null ? formatUsd(generationCost * 100, locale) : "—"}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("settings.priceEstimateHint", {
                  input: ESTIMATED_GENERATION_TOKENS.input.toLocaleString(locale),
                  output: ESTIMATED_GENERATION_TOKENS.output.toLocaleString(locale),
                })}
              </p>
            </div>
            {cfg?.configPath && (
              <p className="text-[11px] text-muted-foreground">{t("settings.configPath", { path: cfg.configPath })}</p>
            )}
          </Card>

          {showPreview && (
            <section className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <Eye className="size-4 text-brand" aria-hidden />
                <h2 className="font-heading text-sm font-semibold">{t("settings.previewTitle")}</h2>
              </div>
              <div className="p-4">
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground/80">
                  {renderStylePreview(style)}
                </pre>
                <p className="mt-2 text-[11px] text-muted-foreground">{t("settings.previewNote")}</p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

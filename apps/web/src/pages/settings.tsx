import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BellRing,
  Bug,
  Check,
  Building2,
  CalendarCog,
  Eye,
  FolderKanban,
  History,
  ListChecks,
  Loader2,
  MessageSquareQuote,
  Monitor,
  Moon,
  Palette,
  Puzzle,
  RotateCcw,
  Save,
  Send,
  SlidersHorizontal,
  Sun,
  UserRound,
  Wand2,
} from "lucide-react";
import {
  fetchNotificationConfig,
  fmtVersionDate,
  saveAiConfig,
  saveNotificationConfig,
  saveProfile,
  testNotificationConfig,
} from "@/api";
import { BarkIcon, DiscordIcon } from "@/components/icons/notification-icons";
import { useAppData } from "@/lib/app-state";
import { BackLink } from "@/components/app-sidebar";
import { OrganizationSection } from "@/components/organization-section";
import { ProjectSourceSection } from "@/components/project-source-section";
import { DebugLogsSection } from "@/components/debug-logs-section";
import { RefreshLogsSection } from "@/components/refresh-logs-section";
import { ExamSettings } from "@/components/exams";
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
import type {
  AbilitySettings,
  AiActivitySections,
  AiModels,
  AiProfile,
  AiStyle,
  NotificationConfigDto,
  NotificationSaveInput,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SettingsTab = "personal" | "notifications" | "ai" | "exams" | "advanced" | "organizacao";

const TABS: SettingsTab[] = ["personal", "notifications", "ai", "exams", "advanced", "organizacao"];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value != null && (TABS as string[]).includes(value);
}

const DEFAULT_MODELS: AiModels = {
  generation: "gpt-4o",
  detection: "gpt-5-nano",
  classification: "gpt-5-nano",
  diagram: "gpt-4o",
  gate: "gpt-5-nano",
  training: "gpt-4o",
};

const MODEL_ROLES: { role: keyof AiModels; labelKey: string; hintKey: string }[] = [
  { role: "generation", labelKey: "settings.models.generation", hintKey: "settings.models.generationHint" },
  { role: "detection", labelKey: "settings.models.detection", hintKey: "settings.models.detectionHint" },
  { role: "classification", labelKey: "settings.models.classification", hintKey: "settings.models.classificationHint" },
  { role: "diagram", labelKey: "settings.models.diagram", hintKey: "settings.models.diagramHint" },
  { role: "gate", labelKey: "settings.models.gate", hintKey: "settings.models.gateHint" },
  { role: "training", labelKey: "settings.models.training", hintKey: "settings.models.trainingHint" },
];

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

function ChannelCard({
  icon,
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card/60 transition-colors",
        checked ? "border-brand/50 bg-brand/5" : "border-border",
      )}
    >
      <label className="flex cursor-pointer items-start gap-3 p-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            checked ? "border-brand/40 bg-brand/10 text-brand" : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground/90">{label}</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(ev) => onChange(ev.target.checked)}
          className="mt-1.5 size-4 shrink-0 accent-brand"
        />
      </label>
      {checked && children && <div className="space-y-2 border-t border-border/60 p-3">{children}</div>}
    </div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useLocalStorage<SettingsTab>(
    "lxp.settings.tab",
    isSettingsTab(requestedTab) ? requestedTab : "ai",
  );
  const lastAppliedTab = useRef<string | null>(null);

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (!requested) {
      lastAppliedTab.current = null;
      return;
    }
    if (!isSettingsTab(requested) || lastAppliedTab.current === requested) return;
    lastAppliedTab.current = requested;
    setTab(requested);
  }, [searchParams, setTab]);

  const selectTab = (value: SettingsTab) => {
    setTab(value);
    if (searchParams.has("tab")) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  };
  const [style, setStyle] = useState<AiStyle>(DEFAULT_STYLE);
  const [sections, setSections] = useState<AiActivitySections>(DEFAULT_ACTIVITY_SECTIONS);
  const [models, setModels] = useState<AiModels>(DEFAULT_MODELS);
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [projectAutoDetect, setProjectAutoDetect] = useState(true);
  const [readAttachments, setReadAttachments] = useState(true);
  const [abilities, setAbilities] = useState<AbilitySettings>({});
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notif, setNotif] = useState<NotificationConfigDto | null>(null);
  const [discordUrl, setDiscordUrl] = useState("");
  const [barkKey, setBarkKey] = useState("");
  const [clearDiscord, setClearDiscord] = useState(false);
  const [clearBark, setClearBark] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);
  const [notifErr, setNotifErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    setStyle({ ...DEFAULT_STYLE, ...cfg.style });
    setSections({ ...DEFAULT_ACTIVITY_SECTIONS, ...cfg.activitySections });
    setModels({
      ...DEFAULT_MODELS,
      ...(cfg.models ?? {}),
      generation: cfg.models?.generation ?? cfg.model,
    });
    setTemperature(String(cfg.temperature ?? ""));
    setMaxTokens(String(cfg.max_output_tokens ?? ""));
    setNome(cfg.profile?.nome ?? "");
    setMatricula(cfg.profile?.matricula ?? "");
    setProjectAutoDetect(cfg.projectAutoDetect !== false);
    setReadAttachments(cfg.readAttachments !== false);
    setAbilities({ ...cfg.abilities });
  }, [cfg]);

  useEffect(() => {
    let alive = true;
    fetchNotificationConfig()
      .then((value) => {
        if (alive) setNotif(value);
      })
      .catch((x) => {
        if (alive) setNotifErr(x instanceof Error ? x.message : String(x));
      });
    return () => {
      alive = false;
    };
  }, []);

  const model = models.generation;
  const selectedModel = findModel(model);
  const generationCost = estimateGenerationCostUsd(model);
  const baseGroups = useMemo(() => groupModels(), []);
  const groupsWithCustom = (value: string) =>
    value && !findModel(value)
      ? [
          {
            group: t("settings.modelCustom"),
            models: [{ id: value, label: value, group: "custom", input: 0, output: 0 }],
          },
          ...baseGroups,
        ]
      : baseGroups;

  const patchModel = (role: keyof AiModels, value: string) => {
    setModels((prev) => ({ ...prev, [role]: value }));
    setMsg(null);
    setErr(null);
  };

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

  const patchNotif = (patch: Partial<NotificationConfigDto>) => {
    setNotif((prev) => (prev ? { ...prev, ...patch } : prev));
    setNotifMsg(null);
    setNotifErr(null);
  };

  const persistNotifications = async (): Promise<NotificationConfigDto | null> => {
    if (!notif) return null;
    const input: NotificationSaveInput = {
      discordEnabled: notif.discordEnabled,
      barkEnabled: notif.barkEnabled,
      notifyNew: notif.notifyNew,
      notifyDueSoon: notif.notifyDueSoon,
      notifyDone: notif.notifyDone,
      notifyExpired: notif.notifyExpired,
    };
    if (clearDiscord) input.clearDiscordWebhook = true;
    else if (discordUrl.trim()) input.discordWebhookUrl = discordUrl.trim();
    if (clearBark) input.clearBarkDeviceKey = true;
    else if (barkKey.trim()) input.barkDeviceKey = barkKey.trim();
    const saved = await saveNotificationConfig(input);
    setNotif(saved);
    setDiscordUrl("");
    setBarkKey("");
    setClearDiscord(false);
    setClearBark(false);
    return saved;
  };

  const testNotifications = async () => {
    setTesting(true);
    setNotifMsg(null);
    setNotifErr(null);
    try {
      await persistNotifications();
      const result = await testNotificationConfig();
      const failed = result.channels.filter((c) => !c.ok);
      if (failed.length === 0) {
        setNotifMsg(t("settings.notif.testOk"));
      } else {
        setNotifErr(
          failed
            .map((c) => `${c.channel === "discord" ? "Discord" : "Bark"}: ${c.error ?? t("settings.notif.testFail")}`)
            .join(" · "),
        );
      }
    } catch (x) {
      setNotifErr(x instanceof Error ? x.message : String(x));
    } finally {
      setTesting(false);
    }
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
      const nextModels = { ...models, generation: nextModel };
      const profile: AiProfile = { nome: nome.trim(), matricula: matricula.trim() };
      await saveAiConfig({
        model: nextModel,
        models: nextModels,
        temperature: temp,
        max_output_tokens: maxTok,
        style,
        activitySections: sections,
        projectAutoDetect,
        readAttachments,
        abilities,
      });
      await saveProfile(profile);
      await persistNotifications();
      patchConfig({
        model: nextModel,
        models: nextModels,
        temperature: temp,
        max_output_tokens: maxTok,
        style,
        activitySections: sections,
        projectAutoDetect,
        readAttachments,
        abilities,
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
        className="flex w-fit flex-wrap items-center gap-0.5 rounded-full border bg-card p-1"
      >
        {TABS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={tab === s}
            onClick={() => selectTab(s)}
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
        </>
      )}

      {tab === "notifications" && (
        <>
          <Card icon={<BellRing className="size-4 text-brand" aria-hidden />} title={t("settings.notif.channels")}>
            <p className="text-xs text-muted-foreground">{t("settings.notif.channelsIntro")}</p>
            {!notif ? (
              <p className="text-xs text-muted-foreground">{t("settings.notif.loading")}</p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ChannelCard
                    icon={<DiscordIcon className="size-5" />}
                    label="Discord"
                    hint={t("settings.notif.discordHint")}
                    checked={notif.discordEnabled}
                    onChange={(v) => patchNotif({ discordEnabled: v })}
                  >
                    <Field label={t("settings.notif.discordWebhook")} hint={t("settings.notif.discordWebhookHint")}>
                      <Input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={discordUrl}
                        onChange={(ev) => {
                          setDiscordUrl(ev.target.value);
                          setClearDiscord(false);
                          setNotifMsg(null);
                          setNotifErr(null);
                        }}
                        placeholder={
                          notif.discordConfigured
                            ? t("settings.notif.configured", { hint: notif.discordHint ?? "…" })
                            : t("settings.notif.discordPlaceholder")
                        }
                      />
                    </Field>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {notif.discordConfigured ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setClearDiscord(true);
                            setDiscordUrl("");
                            patchNotif({ discordConfigured: false, discordHint: null, discordEnabled: false });
                          }}
                        >
                          {t("settings.notif.remove")}
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {t("settings.notif.notConfigured")}
                        </span>
                      )}
                    </div>
                  </ChannelCard>

                  <ChannelCard
                    icon={<BarkIcon className="size-5" />}
                    label="Bark"
                    hint={t("settings.notif.barkHint")}
                    checked={notif.barkEnabled}
                    onChange={(v) => patchNotif({ barkEnabled: v })}
                  >
                    <Field label={t("settings.notif.barkDeviceKey")} hint={t("settings.notif.barkDeviceKeyHint")}>
                      <Input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={barkKey}
                        onChange={(ev) => {
                          setBarkKey(ev.target.value);
                          setClearBark(false);
                          setNotifMsg(null);
                          setNotifErr(null);
                        }}
                        placeholder={
                          notif.barkConfigured
                            ? t("settings.notif.configured", { hint: notif.barkHint ?? "…" })
                            : t("settings.notif.barkPlaceholder")
                        }
                      />
                    </Field>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {notif.barkConfigured ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setClearBark(true);
                            setBarkKey("");
                            patchNotif({ barkConfigured: false, barkHint: null, barkEnabled: false });
                          }}
                        >
                          {t("settings.notif.remove")}
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {t("settings.notif.notConfigured")}
                        </span>
                      )}
                    </div>
                  </ChannelCard>
                </div>

                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={testNotifications}
                    disabled={testing || busy}
                  >
                    {testing ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                    {testing ? t("settings.notif.testing") : t("settings.notif.test")}
                  </Button>
                  <Feedback msg={notifMsg} err={notifErr} />
                  {notif.lastEventAt && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("settings.notif.lastEvent", { when: fmtVersionDate(notif.lastEventAt, locale) })}
                    </p>
                  )}
                  {notif.lastError && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                      {notif.lastError}
                    </p>
                  )}
                </div>
              </>
            )}
          </Card>

          <Card icon={<BellRing className="size-4 text-brand" aria-hidden />} title={t("settings.notif.events")}>
            <p className="text-xs text-muted-foreground">{t("settings.notif.eventsIntro")}</p>
            {notif && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle
                  label={t("settings.notif.new")}
                  hint={t("settings.notif.newHint")}
                  checked={notif.notifyNew}
                  onChange={(v) => patchNotif({ notifyNew: v })}
                />
                <Toggle
                  label={t("settings.notif.dueSoon")}
                  hint={t("settings.notif.dueSoonHint")}
                  checked={notif.notifyDueSoon}
                  onChange={(v) => patchNotif({ notifyDueSoon: v })}
                />
                <Toggle
                  label={t("settings.notif.done")}
                  hint={t("settings.notif.doneHint")}
                  checked={notif.notifyDone}
                  onChange={(v) => patchNotif({ notifyDone: v })}
                />
                <Toggle
                  label={t("settings.notif.expired")}
                  hint={t("settings.notif.expiredHint")}
                  checked={notif.notifyExpired}
                  onChange={(v) => patchNotif({ notifyExpired: v })}
                />
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "organizacao" && (
        <Card icon={<Building2 className="size-4 text-brand" aria-hidden />} title={t("org.title")}>
          <p className="text-xs text-muted-foreground">{t("org.desc")}</p>
          <OrganizationSection />
          <ProjectSourceSection />
        </Card>
      )}

      {tab === "exams" && (
        <Card icon={<CalendarCog className="size-4 text-brand" aria-hidden />} title={t("exams.settingsTitle")}>
          <ExamSettings />
        </Card>
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
            <Toggle
              label={t("settings.readAttachments")}
              hint={t("settings.readAttachmentsHint")}
              checked={readAttachments}
              onChange={(v) => {
                setReadAttachments(v);
                setMsg(null);
                setErr(null);
              }}
            />
          </Card>

          <Card icon={<FolderKanban className="size-4 text-brand" aria-hidden />} title={t("settings.projectContext")}>
            <p className="text-xs text-muted-foreground">{t("settings.projectContextIntro")}</p>
            <Toggle
              label={t("settings.projectAutoDetect")}
              hint={t("settings.projectAutoDetectHint")}
              checked={projectAutoDetect}
              onChange={(v) => {
                setProjectAutoDetect(v);
                setMsg(null);
                setErr(null);
              }}
            />
          </Card>

          <Card icon={<Puzzle className="size-4 text-brand" aria-hidden />} title={t("settings.abilities")}>
            <p className="text-xs text-muted-foreground">{t("settings.abilitiesIntro")}</p>
            {(cfg?.abilityRegistry ?? []).map((ability) => (
              <Toggle
                key={ability.id}
                label={ability.label}
                checked={abilities[ability.id] === true}
                onChange={(v) => {
                  setAbilities((prev) => ({ ...prev, [ability.id]: v }));
                  setMsg(null);
                  setErr(null);
                }}
              />
            ))}
          </Card>
        </>
      )}

      {tab === "advanced" && (
        <>
          <Card icon={<SlidersHorizontal className="size-4 text-brand" aria-hidden />} title={t("settings.models.title")}>
            <p className="text-xs text-muted-foreground">{t("settings.models.intro")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODEL_ROLES.map(({ role, labelKey, hintKey }) => (
                <Field key={role} label={t(labelKey)} hint={t(hintKey)}>
                  <Select
                    value={models[role]}
                    aria-label={t(labelKey)}
                    onChange={(ev) => patchModel(role, ev.target.value)}
                  >
                    {groupsWithCustom(models[role]).map((g) => (
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
              ))}
            </div>
          </Card>

          <Card icon={<SlidersHorizontal className="size-4 text-brand" aria-hidden />} title={t("settings.generation")}>
            <div className="grid gap-3 sm:grid-cols-2">
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

          <Card icon={<Bug className="size-4 text-brand" aria-hidden />} title={t("debug.title")}>
            <DebugLogsSection />
          </Card>

          <Card icon={<History className="size-4 text-brand" aria-hidden />} title={t("settings.logs.title")}>
            <RefreshLogsSection />
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

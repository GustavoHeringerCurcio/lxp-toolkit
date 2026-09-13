import { useCallback, useEffect, useState } from "react";
import { Check, FolderKanban, Loader2, Plus, Sparkles, Save } from "lucide-react";
import { analyzeActivityContext, saveActivityProject, saveProjectProfile } from "@/api";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import type { AnalyzeResultDto, Exercise, ProjectProfileMode } from "@/types";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CUSTOM = "__custom";

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Generic, automatic project context for an activity.
 *
 * The server lazily decides whether the activity needs a project; when it does,
 * this card surfaces the course MAIN project or a QUICK project that overrides
 * it for this activity. The chosen context is injected into the AI prompt.
 */
export function ProjectPanel({ e, onSaved }: { e: Exercise; onSaved?: () => void }) {
  const { cfg } = useAppData();
  const { t } = useT();
  const [analysis, setAnalysis] = useState<AnalyzeResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ProjectProfileMode>("main");
  const [theme, setTheme] = useState("");
  const [customTheme, setCustomTheme] = useState("");
  const [atores, setAtores] = useState("");
  const [requisitos, setRequisitos] = useState("");

  const autoDetect = cfg?.projectAutoDetect !== false;

  const fillFrom = useCallback((a: AnalyzeResultDto, m: ProjectProfileMode) => {
    const source =
      m === "activity"
        ? a.activity.theme || a.activity.atores.length || a.activity.requisitos.length
          ? { theme: a.activity.theme ?? "", atores: a.activity.atores, requisitos: a.activity.requisitos }
          : (a.proposed ?? { theme: "", atores: [], requisitos: [] })
        : {
            theme: a.mainProfile?.theme ?? "",
            atores: a.mainProfile?.atores ?? [],
            requisitos: a.mainProfile?.requisitos ?? [],
          };
    setTheme(source.theme);
    setCustomTheme("");
    setAtores(source.atores.join(", "));
    setRequisitos(source.requisitos.join("\n"));
  }, []);

  const applyAnalysis = useCallback(
    (a: AnalyzeResultDto) => {
      setAnalysis(a);
      const m = a.activity.profileMode ?? "main";
      setMode(m);
      fillFrom(a, m);
      if (a.needsProject) setOpen(true);
    },
    [fillFrom],
  );

  const analyze = useCallback(
    async (forceProfile = false) => {
      setBusy(true);
      setErr(null);
      try {
        const a = await analyzeActivityContext(e.id, forceProfile);
        applyAnalysis(a);
        if (forceProfile) setMsg(t("project.detected"));
      } catch (x) {
        setErr(x instanceof Error ? x.message : String(x));
      } finally {
        setBusy(false);
      }
    },
    [e.id, applyAnalysis, t],
  );

  useEffect(() => {
    setAnalysis(null);
    setMsg(null);
    setErr(null);
    setOpen(false);
    if (autoDetect) void analyze(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, autoDetect]);

  const onModeChange = (m: ProjectProfileMode) => {
    setMode(m);
    if (analysis) fillFrom(analysis, m);
  };

  const effectiveTheme = customTheme.trim() || theme;
  const suggested = analysis?.mainProfile?.suggestedThemes ?? [];

  const save = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === "none") {
        await saveActivityProject({ id: e.id, needsProject: false, profileMode: "none" });
      } else if (mode === "activity") {
        await saveActivityProject({
          id: e.id,
          needsProject: true,
          profileMode: "activity",
          theme: effectiveTheme,
          atores: splitList(atores),
          requisitos: splitList(requisitos),
        });
      } else {
        await saveProjectProfile({
          courseId: e.courseId,
          theme: effectiveTheme,
          atores: splitList(atores),
          requisitos: splitList(requisitos),
          // Keep the detected suggestions when we have none to send.
          suggestedThemes: suggested.length ? suggested : undefined,
        });
        await saveActivityProject({ id: e.id, needsProject: true, profileMode: "main" });
      }
      setMsg(t("project.saved"));
      onSaved?.();
      void analyze(false);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const needsProject = analysis?.needsProject === true;
  if (!open && !needsProject) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
      >
        <Plus className="size-3.5" aria-hidden />
        {t("project.add")}
      </button>
    );
  }

  return (
    <CollapsibleCard
      id="projeto"
      icon={<FolderKanban className="size-4 shrink-0 text-brand" aria-hidden />}
      title={t("project.title")}
      badge={
        analysis && (
          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {analysis.source === "manual" ? t("project.badgeManual") : t("project.badgeAuto")}
          </span>
        )
      }
      bodyClassName="space-y-3 p-4"
    >
      <p className="text-xs text-muted-foreground">{t("project.intro")}</p>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {t("project.mode")}
        </span>
        <Select value={mode} onChange={(ev) => onModeChange(ev.target.value as ProjectProfileMode)} disabled={busy}>
          <option value="main">
            {analysis?.mainProfile?.theme
              ? t("project.modeMainNamed", { theme: analysis.mainProfile.theme })
              : t("project.modeMain")}
          </option>
          <option value="activity">{t("project.modeActivity")}</option>
          <option value="none">{t("project.modeNone")}</option>
        </Select>
      </label>

      {mode !== "none" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("project.theme")}
              </span>
              <Select value={theme} onChange={(ev) => setTheme(ev.target.value)} disabled={busy}>
                <option value="">{t("project.themeNone")}</option>
                {suggested.map((th) => (
                  <option key={th} value={th}>
                    {th}
                  </option>
                ))}
                <option value={CUSTOM}>{t("project.themeOther")}</option>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("project.customTheme")}
              </span>
              <Input
                value={customTheme}
                onChange={(ev) => setCustomTheme(ev.target.value)}
                placeholder={t("project.customThemePlaceholder")}
                disabled={busy}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t("project.actors")}
            </span>
            <Input
              value={atores}
              onChange={(ev) => setAtores(ev.target.value)}
              placeholder={t("project.actorsPlaceholder")}
              disabled={busy}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t("project.requirements")}
            </span>
            <Textarea
              value={requisitos}
              onChange={(ev) => setRequisitos(ev.target.value)}
              rows={4}
              placeholder={t("project.requirementsPlaceholder")}
              disabled={busy}
              className="min-h-20 leading-relaxed"
            />
          </label>
        </>
      )}

      {analysis?.intent && (
        <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {t("project.intent", { intent: analysis.intent })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void analyze(true)} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {busy ? t("project.detecting") : t("project.detect")}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          <Save aria-hidden />
          {t("project.save")}
        </Button>
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
    </CollapsibleCard>
  );
}

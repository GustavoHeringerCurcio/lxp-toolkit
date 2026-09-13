import { useEffect, useState } from "react";
import { Check, FolderKanban, Loader2, Save, Sparkles } from "lucide-react";
import { detectActivityContext, saveAiRequest } from "@/api";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import {
  PROJECT_THEMES,
  composeContextInstructions,
  parseContextInstructions,
} from "@/lib/themes";
import type { Exercise } from "@/types";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CUSTOM = "__custom";

/**
 * Lets the student tell the generator which project an activity belongs to
 * (theme + actors + functional requirements), either by picking a theme or by
 * letting a cheap model detect it from the activity and course material. The
 * result is stored as the per-exercise AI request that grounds generation.
 */
export function ProjectPanel({ e, onSaved }: { e: Exercise; onSaved?: () => void }) {
  const { patchExercise } = useAppData();
  const { t } = useT();
  const [theme, setTheme] = useState("");
  const [customTheme, setCustomTheme] = useState("");
  const [atores, setAtores] = useState("");
  const [requisitos, setRequisitos] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMsg(null);
    setWarn(null);
    setErr(null);
  }, [e.id]);

  useEffect(() => {
    const parsed = parseContextInstructions(e.aiRequestJson);
    if (!parsed) {
      setTheme("");
      setCustomTheme("");
      setAtores("");
      setRequisitos("");
      return;
    }
    const known = (PROJECT_THEMES as readonly string[]).includes(parsed.theme);
    if (known) {
      setTheme(parsed.theme);
      setCustomTheme("");
    } else {
      setTheme(parsed.theme ? CUSTOM : "");
      setCustomTheme(parsed.theme);
    }
    setAtores(parsed.atores.join(", "));
    setRequisitos(parsed.requisitos.join("\n"));
  }, [e.id, e.aiRequestJson]);

  const effectiveTheme = customTheme.trim() || theme;
  const splitList = (value: string): string[] =>
    value
      .split(/[,\n]/)
      .map((s) => s.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);

  const detect = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    setWarn(null);
    try {
      const d = await detectActivityContext(e.id);
      const detectedTheme = d.theme.trim();
      const known = (PROJECT_THEMES as readonly string[]).includes(detectedTheme);
      if (known) {
        setTheme(detectedTheme);
        setCustomTheme("");
      } else if (detectedTheme) {
        setTheme(CUSTOM);
        setCustomTheme(detectedTheme);
      } else {
        setTheme("");
        setCustomTheme("");
      }
      setAtores(d.atores.join(", "));
      setRequisitos(d.requisitos.join("\n"));
      if (detectedTheme || d.atores.length || d.requisitos.length) {
        setMsg(t("project.detected", { model: d.model }));
      } else {
        setWarn(t("project.detectedEmpty"));
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const instructions = composeContextInstructions({
        theme: effectiveTheme,
        atores: splitList(atores),
        requisitos: splitList(requisitos),
      });
      const res = await saveAiRequest(e.id, instructions.trim() ? instructions : null);
      patchExercise(e.id, { aiRequestJson: res.aiRequestJson, hasAiOverride: res.hasAiOverride });
      setMsg(instructions.trim() ? t("project.saved") : t("project.removed"));
      if (instructions.trim()) onSaved?.();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CollapsibleCard
      id="projeto"
      icon={<FolderKanban className="size-4 shrink-0 text-brand" aria-hidden />}
      title={t("project.title")}
      badge={
        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {t("project.badge")}
        </span>
      }
      bodyClassName="space-y-3 p-4"
    >
      <p className="text-xs text-muted-foreground">{t("project.intro")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t("project.theme")}
          </span>
          <Select value={theme} onChange={(ev) => setTheme(ev.target.value)} disabled={busy}>
            <option value="">{t("project.themeNone")}</option>
            {PROJECT_THEMES.map((th) => (
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

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void detect()} disabled={busy}>
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
      {warn && (
        <p className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          {warn}
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

import { useEffect, useState } from "react";
import { Check, Eye, Loader2, Save, Trash2, Wand2 } from "lucide-react";
import { saveAiRequest } from "@/api";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import {
  DEFAULT_ACTIVITY_SECTIONS,
  DEFAULT_STYLE,
  renderPreviewMessage,
  resolveExtraInstructions,
} from "@/lib/prompt-preview";
import type { Exercise } from "@/types";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Textarea } from "@/components/ui/textarea";

export function AiRequestPanel({ e, onSaved }: { e: Exercise; onSaved?: () => void }) {
  const { cfg, patchExercise } = useAppData();
  const { t } = useT();
  const style = cfg?.style ?? DEFAULT_STYLE;
  const sections = cfg?.activitySections ?? DEFAULT_ACTIVITY_SECTIONS;
  const profile = cfg?.profile ?? { nome: "", matricula: "" };
  const [text, setText] = useState(() => resolveExtraInstructions(e.aiRequestJson));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setText(resolveExtraInstructions(e.aiRequestJson));
    setMsg(null);
    setErr(null);
  }, [e.id, e.aiRequestJson]);

  const persist = async (value: string) => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const raw = value.trim() ? value : null;
      const res = await saveAiRequest(e.id, raw);
      patchExercise(e.id, { aiRequestJson: res.aiRequestJson, hasAiOverride: res.hasAiOverride });
      setMsg(raw ? t("aiPanel.savedMsg") : t("aiPanel.removedMsg"));
      if (raw) onSaved?.();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const previewText = showPreview
    ? renderPreviewMessage(style, sections, e, profile, text)
    : "";

  return (
    <CollapsibleCard
      id="ai-request"
      icon={<Wand2 className="size-4 shrink-0 text-brand" aria-hidden />}
      title={t("aiPanel.title")}
      badge={
        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {t("aiPanel.badge")}
        </span>
      }
      bodyClassName="space-y-3 p-4"
    >
      <p className="text-xs text-muted-foreground">{t("aiPanel.intro")}</p>

      <Textarea
        value={text}
        onChange={(ev) => {
          setText(ev.target.value);
          setMsg(null);
        }}
        rows={5}
        placeholder={t("aiPanel.placeholder")}
        aria-label={t("aiPanel.aria")}
        className="min-h-24 leading-relaxed"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void persist(text)} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t("aiPanel.save")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setText("");
            void persist("");
          }}
          disabled={busy || (!text.trim() && !e.hasAiOverride)}
        >
          <Trash2 aria-hidden />
          {t("aiPanel.remove")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setShowPreview((v) => !v)}
          aria-pressed={showPreview}
        >
          <Eye aria-hidden />
          {showPreview ? t("common.hidePreview") : t("common.showPreview")}
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

      {showPreview && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("aiPanel.previewTitle")}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-card p-3 text-[11px] leading-relaxed text-foreground/80">
            {previewText}
          </pre>
          {e.kind === "upload" && e.files.length > 0 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("aiPanel.previewNote")}</p>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}

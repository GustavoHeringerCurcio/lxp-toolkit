import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { analyzeDraftGate } from "@/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Exercise, GateResultDto, GateVerdict } from "@/types";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";

/** Tiny, stable hash so identical drafts are not re-analyzed. */
function hashDraft(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

const LEVELS: readonly GateVerdict[] = ["terrible", "bad", "ok", "good"];

/** Visual mapping only: the model outputs a level, the UI shows a confidence %. */
const TONE: Record<
  GateVerdict,
  { pct: number; bar: string; text: string; border: string; bg: string }
> = {
  terrible: {
    pct: 25,
    bar: "bg-destructive",
    text: "text-destructive",
    border: "border-destructive/30",
    bg: "bg-destructive/10",
  },
  bad: {
    pct: 50,
    bar: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    bg: "bg-orange-500/10",
  },
  ok: {
    pct: 75,
    bar: "bg-soon",
    text: "text-soon",
    border: "border-soon/30",
    bg: "bg-soon/10",
  },
  good: {
    pct: 100,
    bar: "bg-ok",
    text: "text-ok",
    border: "border-ok/30",
    bg: "bg-ok/10",
  },
};

/**
 * Quality gate above the draft: a four-level judgment (terrible | bad | ok |
 * good) with a one-line reason. Advisory only — it never blocks sending.
 */
export function GatePanel({
  e,
  draft,
  initial,
}: {
  e: Exercise;
  draft: string;
  initial?: GateResultDto | null;
}) {
  const { t } = useT();
  const [result, setResult] = useState<GateResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cache = useRef<Map<string, GateResultDto>>(new Map());

  const run = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setResult(null);
        setErr(null);
        return;
      }
      const key = `${e.id}:${hashDraft(trimmed)}`;
      const cached = cache.current.get(key);
      if (cached) {
        setResult(cached);
        setErr(null);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const r = await analyzeDraftGate(e.id, trimmed);
        if (r) {
          cache.current.set(key, r);
          setResult(r);
        } else {
          setErr(t("gate.error"));
        }
      } catch (x) {
        setErr(x instanceof Error ? x.message : String(x));
      } finally {
        setLoading(false);
      }
    },
    [e.id, t],
  );

  // Reset when the activity changes.
  useEffect(() => {
    setResult(null);
    setErr(null);
    cache.current.clear();
  }, [e.id]);

  // Hydrate from the saved analysis (persisted with the answer version, or
  // delivered by the generation stream) when it matches the current draft, so
  // a generated draft shows its confidence without pressing Analyze.
  useEffect(() => {
    if (result || !initial) return;
    const text = draft.trim();
    if (text && initial.draftHash === hashDraft(text)) {
      cache.current.set(`${e.id}:${hashDraft(text)}`, initial);
      setResult(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, result]);

  // A changed draft invalidates the shown confidence, so the user is never
  // looking at a judgment for text that no longer exists.
  useEffect(() => {
    if (!result) return;
    const text = draft.trim();
    if (!text || result.draftHash !== hashDraft(text)) setResult(null);
  }, [draft, result]);

  const hasDraft = Boolean(draft.trim());
  const tone = result ? TONE[result.verdict] : null;

  return (
    <CollapsibleCard
      id="gate"
      icon={<ShieldCheck className="size-4 shrink-0 text-brand" aria-hidden />}
      title={t("gate.title")}
      className="shrink-0"
      bodyClassName="space-y-2.5 p-3"
      badge={
        result &&
        tone && (
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                tone.border,
                tone.bg,
                tone.text,
              )}
            >
              {t(`gate.verdict.${result.verdict}`)}
            </span>
            {result.logged && (
              <span className="rounded-full border border-soon/30 bg-soon/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
                {t("gate.logged")}
              </span>
            )}
          </span>
        )
      }
      actions={
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void run(draft)}
          disabled={loading || !hasDraft}
        >
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          {loading ? t("gate.analyzing") : result ? t("gate.reanalyze") : t("gate.analyze")}
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("h-full transition-[width] duration-500", tone?.bar ?? "bg-muted")}
            style={{ width: `${tone?.pct ?? 0}%` }}
          />
        </span>
        <span className="w-9 text-right text-xs font-semibold tabular-nums">
          {tone ? `${tone.pct}%` : "—"}
        </span>
      </div>

      {result && tone && (
        <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
          {LEVELS.map((level) => (
            <span
              key={level}
              className={cn(
                level === result.verdict
                  ? cn("font-semibold", TONE[level].text)
                  : "text-muted-foreground",
              )}
            >
              {t(`gate.verdict.${level}`)}
            </span>
          ))}
        </div>
      )}

      {!hasDraft && <p className="text-xs text-muted-foreground">{t("gate.idle")}</p>}
      {hasDraft && !result && !loading && !err && (
        <p className="text-xs text-muted-foreground">{t("gate.pending")}</p>
      )}
      {err && (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {err}
        </p>
      )}

      {result && (
        <>
          {result.reason && <p className="text-xs text-muted-foreground">{result.reason}</p>}
          <p className="text-[10px] text-muted-foreground">{t("gate.advisory")}</p>
        </>
      )}
    </CollapsibleCard>
  );
}

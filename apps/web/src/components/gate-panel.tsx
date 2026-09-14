import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { analyzeDraftGate } from "@/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Exercise, GateResultDto } from "@/types";
import { Button } from "@/components/ui/button";

/** Tiny, stable hash so identical drafts are not re-analyzed. */
function hashDraft(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

const TONE = {
  ready: { bar: "bg-ok", text: "text-ok", border: "border-ok/30", bg: "bg-ok/10" },
  review: { bar: "bg-soon", text: "text-soon", border: "border-soon/30", bg: "bg-soon/10" },
  weak: { bar: "bg-destructive", text: "text-destructive", border: "border-destructive/30", bg: "bg-destructive/10" },
} as const;

function scoreTone(value: number): string {
  if (value >= 80) return "bg-ok";
  if (value >= 50) return "bg-soon";
  return "bg-destructive";
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
      <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}%</p>
      <span className="mt-1 flex h-1 overflow-hidden rounded-full bg-muted">
        <span className={cn("h-full", scoreTone(value))} style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

function BulletList({ title, items, tone }: { title: string; items: string[]; tone: "warn" | "brand" }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
            <span className={tone === "warn" ? "text-soon" : "text-brand"} aria-hidden>
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Quality gate above the draft: a cheap-model analysis of the generated answer
 * against the professor's question, rendered as a confidence bar. Advisory only
 * — it never blocks sending.
 */
export function GatePanel({ e, draft, token }: { e: Exercise; draft: string; token: number }) {
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

  // Auto-run after each generation (the parent bumps `token`).
  useEffect(() => {
    if (token > 0) void run(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const hasDraft = Boolean(draft.trim());
  const tone = result ? TONE[result.verdict] : TONE.review;

  return (
    <section className="shrink-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-brand" aria-hidden />
        <h3 className="font-heading text-sm font-semibold">{t("gate.title")}</h3>
        {result && (
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
        )}
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => void run(draft)}
          disabled={loading || !hasDraft}
        >
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          {loading ? t("gate.analyzing") : result ? t("gate.reanalyze") : t("gate.analyze")}
        </Button>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("h-full transition-[width] duration-500", tone.bar)}
            style={{ width: `${result?.score ?? 0}%` }}
          />
        </span>
        <span className="w-9 text-right text-xs font-semibold tabular-nums">
          {result ? `${result.score}%` : "—"}
        </span>
      </div>

      {!hasDraft && <p className="mt-2 text-xs text-muted-foreground">{t("gate.idle")}</p>}
      {hasDraft && !result && !loading && !err && (
        <p className="mt-2 text-xs text-muted-foreground">{t("gate.pending")}</p>
      )}
      {err && (
        <p className="mt-2 flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {err}
        </p>
      )}

      {result && (
        <>
          {result.summary && <p className="mt-2 text-xs text-muted-foreground">{result.summary}</p>}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <SubScore label={t("gate.human")} value={result.humanScore} />
            <SubScore label={t("gate.relevance")} value={result.relevanceScore} />
            <SubScore label={t("gate.completeness")} value={result.completenessScore} />
          </div>
          {(result.issues.length > 0 || result.suggestions.length > 0) && (
            <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5">
              {result.issues.length > 0 && (
                <BulletList title={t("gate.issues")} items={result.issues} tone="warn" />
              )}
              {result.suggestions.length > 0 && (
                <BulletList title={t("gate.suggestions")} items={result.suggestions} tone="brand" />
              )}
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">{t("gate.advisory")}</p>
        </>
      )}
    </section>
  );
}

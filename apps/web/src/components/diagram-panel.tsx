import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, GitBranch, Loader2, RefreshCw } from "lucide-react";
import { fetchActivityAbilities, generateDiagram } from "@/api";
import { useAppData } from "@/lib/app-state";
import { useT } from "@/lib/i18n";
import type { DiagramArtifactDto, Exercise } from "@/types";
import { Button } from "@/components/ui/button";

function download(filename: string, url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

/**
 * UML diagram tool card: shown only when the `uml_diagram` ability is enabled
 * for the activity. Builds a diagram from the current draft on demand.
 */
export function DiagramPanel({ e, draft }: { e: Exercise; draft: string }) {
  const { cfg } = useAppData();
  const { t } = useT();
  const [enabled, setEnabled] = useState(false);
  const [artifact, setArtifact] = useState<DiagramArtifactDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [pngLoading, setPngLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let alive = true;
    fetchActivityAbilities(e.id)
      .then((overrides) => {
        if (!alive) return;
        const override = overrides.uml_diagram;
        setEnabled(
          typeof override === "boolean" ? override : cfg?.abilities?.uml_diagram === true,
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [e.id, cfg?.abilities?.uml_diagram]);

  useEffect(() => {
    setArtifact(null);
    setErr(null);
  }, [e.id]);

  const run = useCallback(async (): Promise<void> => {
    const text = draftRef.current.trim();
    if (!text) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await generateDiagram(e.id, text);
      if (r) setArtifact(r);
      else setErr(t("diagram.error"));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setLoading(false);
    }
  }, [e.id, t]);

  const runPng = useCallback(async (): Promise<void> => {
    const text = draftRef.current.trim();
    if (!text) return;
    setPngLoading(true);
    setErr(null);
    try {
      const r = await generateDiagram(e.id, text, true);
      if (r?.pngDataUrl) download(`diagrama-${e.id}.png`, r.pngDataUrl);
      else setErr(t("diagram.error"));
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setPngLoading(false);
    }
  }, [e.id, t]);

  if (!enabled) return null;

  const hasDraft = Boolean(draft.trim());
  const svgUrl = artifact
    ? `data:image/svg+xml;utf8,${encodeURIComponent(artifact.svg)}`
    : null;

  return (
    <section className="shrink-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <GitBranch className="size-4 shrink-0 text-brand" aria-hidden />
        <h3 className="font-heading text-sm font-semibold">{t("diagram.title")}</h3>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => void run()}
          disabled={loading || !hasDraft}
        >
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          {loading ? t("diagram.generating") : artifact ? t("diagram.regenerate") : t("diagram.generate")}
        </Button>
      </div>

      {!hasDraft && <p className="mt-2 text-xs text-muted-foreground">{t("diagram.empty")}</p>}
      {hasDraft && !artifact && !loading && !err && (
        <p className="mt-2 text-xs text-muted-foreground">{t("diagram.hint")}</p>
      )}
      {err && (
        <p className="mt-2 flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {err}
        </p>
      )}

      {artifact && svgUrl && (
        <>
          <div className="mt-2.5 overflow-x-auto rounded-lg border border-border/60 bg-white p-2">
            <img src={svgUrl} alt={t("diagram.title")} className="mx-auto max-w-full" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => download(`diagrama-${e.id}.svg`, svgUrl)}
            >
              <Download aria-hidden /> SVG
            </Button>
            <Button variant="outline" size="xs" onClick={() => void runPng()} disabled={pngLoading}>
              {pngLoading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} PNG
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

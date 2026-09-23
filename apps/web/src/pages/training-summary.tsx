import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  FileDown,
  ListTree,
  Loader2,
  NotebookText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchStudySummary,
  fetchSummaryItems,
  fetchSummaryPdf,
  fetchTrainingSubjects,
  fmtVersionDate,
  streamStudySummary,
} from "@/api";
import type { StudySummary, SummaryItem, SummarySize, TrainingSubject } from "@/types";
import { useT } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";
import { TrainingSubjectPicker } from "@/components/training-subject-picker";
import { ExamPicker } from "@/components/exams";
import { Markdown } from "@/lib/markdown";
import { SummarySources, SummarySourcesBreakdown } from "@/components/summary-sources";
import { NoData } from "@/components/state-screens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SIZES: SummarySize[] = ["small", "medium", "big", "extra"];

interface StepState {
  phase: "map" | "combine";
  index: number;
  total: number;
  label: string;
}

export function TrainingSummaryPage() {
  const { t } = useT();
  const { courseId, moduleId, examId, summarySize, setSummarySize } = useTrainingState();

  const [subjects, setSubjects] = useState<TrainingSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [step, setStep] = useState<StepState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SummaryItem[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const streamRef = useRef("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await fetchTrainingSubjects();
        if (alive) setSubjects(s);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoadingSubjects(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load the saved Resumo whenever the scope or size changes.
  useEffect(() => {
    if (!courseId) {
      setSummary(null);
      return;
    }
    let alive = true;
    setLoadingSummary(true);
    setError(null);
    fetchStudySummary({ courseId, moduleId, examId, size: summarySize })
      .then((s) => {
        if (alive) setSummary(s);
      })
      .catch(() => {
        if (alive) setSummary(null);
      })
      .finally(() => {
        if (alive) setLoadingSummary(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, moduleId, examId, summarySize]);

  // Invalidate the live source preview when the scope changes.
  useEffect(() => {
    setPreview(null);
  }, [courseId, moduleId, examId]);

  const generate = useCallback(async () => {
    if (!courseId) {
      toast.error(t("summary.pickSubjectFirst"));
      return;
    }
    setGenerating(true);
    setError(null);
    setSummary(null);
    setStreamed("");
    setStep(null);
    streamRef.current = "";
    try {
      const saved = await streamStudySummary({ courseId, moduleId, examId, size: summarySize }, (e) => {
        if (e.type === "step") {
          setStep({ phase: e.phase ?? "map", index: e.index ?? 0, total: e.total ?? 1, label: e.label ?? "" });
        } else if (e.type === "delta" && e.delta) {
          streamRef.current += e.delta;
          setStreamed(streamRef.current);
        }
      });
      setSummary(saved);
      setStreamed("");
      setStep(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("summary.error");
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }, [courseId, moduleId, examId, summarySize, t]);

  const copy = async () => {
    const text = summary?.content ?? streamed;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(t("summary.copied"));
  };

  const downloadPdf = async () => {
    const text = summary?.content ?? streamed;
    if (!text) return;
    const title = summary?.subjectLabel ?? t("nav.summary");
    try {
      const { blob, filename } = await fetchSummaryPdf(title, text, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("summary.pdfError"));
    }
  };

  const openPreview = async () => {
    if (!courseId) return;
    setPreviewOpen(true);
    if (preview) return;
    setPreviewLoading(true);
    try {
      const res = await fetchSummaryItems({ courseId, moduleId, examId });
      setPreview(res.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loadingSubjects) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <NoData title={t("training.emptyTitle")} detail={t("training.emptyDetail")} />
      </div>
    );
  }

  const stepLabel =
    step?.phase === "map"
      ? t("summary.stepMap", { done: step.index + 1, total: step.total })
      : t("summary.stepCombine");

  const shownItems = summary?.items ?? preview ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight">
          <NotebookText className="size-6 text-brand" aria-hidden />
          {t("nav.summary")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("summary.intro")}</p>
      </header>

      <TrainingSubjectPicker subjects={subjects} disabled={generating} />
      <ExamPicker courseId={courseId} disabled={generating} />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("summary.sizeLabel")}
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("summary.sizeLabel")}>
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              disabled={generating}
              aria-pressed={summarySize === size}
              onClick={() => setSummarySize(size)}
              title={t(`summary.size.${size}.hint`)}
              className={cn(
                "rounded-full border px-3.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                summarySize === size
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {t(`summary.size.${size}`)}
            </button>
          ))}
        </div>
      </div>

      {error && !generating && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {generating ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
            <span>{stepLabel}</span>
            {step?.phase === "map" && step.label && <span className="truncate text-xs">· {step.label}</span>}
          </div>
          {streamed && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <Markdown content={streamed} />
            </div>
          )}
        </div>
      ) : loadingSummary ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : summary ? (
        <article className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {summary.subjectLabel}
                <span className="ml-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`summary.size.${summary.size}`)}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("summary.savedAt", { date: fmtVersionDate(summary.updatedAt) })}
                {" · "}
                {t("summary.items", { n: summary.itemCount })}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" size="sm" onClick={() => void copy()}>
                <Copy aria-hidden />
                {t("summary.copy")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void downloadPdf()}>
                <FileDown aria-hidden />
                {t("summary.downloadPdf")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void generate()}>
                <RotateCcw aria-hidden />
                {t("summary.regenerate")}
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <Markdown content={summary.content} />

            <details className="mt-5 rounded-lg border bg-muted/20">
              <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[13px] font-medium">
                <ListTree className="size-3.5 text-muted-foreground" aria-hidden />
                {t("summary.sourcesUsed", { n: summary.items.length })}
                <SummarySourcesBreakdown items={summary.items} className="ml-auto" />
              </summary>
              <div className="border-t p-3">
                <SummarySources items={summary.items} />
              </div>
            </details>
          </div>
        </article>
      ) : (
        <NoData
          title={t("summary.emptyTitle")}
          detail={t("summary.emptyDetail")}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button disabled={!courseId} onClick={() => void generate()}>
                <Sparkles aria-hidden />
                {t("summary.generate")}
              </Button>
              <Button variant="ghost" disabled={!courseId} onClick={() => void openPreview()}>
                <ListTree aria-hidden />
                {t("summary.viewSources")}
              </Button>
            </div>
          }
        />
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("summary.sourcesTitle")}</DialogTitle>
            <DialogDescription>{t("summary.sourcesPreviewDesc")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            {previewLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : (
              <SummarySources items={shownItems} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

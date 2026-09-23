import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Loader2, NotebookText, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fetchStudySummary, fetchTrainingSubjects, fmtVersionDate, streamStudySummary } from "@/api";
import type { StudySummary, TrainingSubject } from "@/types";
import { useT } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";
import { TrainingSubjectPicker } from "@/components/training-subject-picker";
import { Markdown } from "@/lib/markdown";
import { NoData } from "@/components/state-screens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface StepState {
  phase: "map" | "combine";
  index: number;
  total: number;
  label: string;
}

export function TrainingSummaryPage() {
  const { t } = useT();
  const { courseId, moduleId } = useTrainingState();

  const [subjects, setSubjects] = useState<TrainingSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [step, setStep] = useState<StepState | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Load the saved Resumo whenever the scope changes.
  useEffect(() => {
    if (!courseId) {
      setSummary(null);
      return;
    }
    let alive = true;
    setLoadingSummary(true);
    setError(null);
    fetchStudySummary({ courseId, moduleId })
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
  }, [courseId, moduleId]);

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
      const saved = await streamStudySummary({ courseId, moduleId }, (e) => {
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
  }, [courseId, moduleId, t]);

  const copy = async () => {
    const text = summary?.content ?? streamed;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(t("summary.copied"));
  };

  const download = () => {
    const text = summary?.content ?? streamed;
    if (!text) return;
    const subject = summary?.subjectLabel ?? "";
    const name = `${subject || "resumo"}`.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "resumo";
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.md`;
    a.click();
    URL.revokeObjectURL(url);
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
            {step?.phase === "map" && step.label && (
              <span className="truncate text-xs">· {step.label}</span>
            )}
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
              <p className="truncate text-sm font-medium">{summary.subjectLabel}</p>
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
              <Button variant="ghost" size="sm" onClick={download}>
                <Download aria-hidden />
                {t("summary.download")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void generate()}>
                <RotateCcw aria-hidden />
                {t("summary.regenerate")}
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <Markdown content={summary.content} />
          </div>
        </article>
      ) : (
        <NoData
          title={t("summary.emptyTitle")}
          detail={t("summary.emptyDetail")}
          action={
            <Button disabled={!courseId} onClick={() => void generate()}>
              <Sparkles aria-hidden />
              {t("summary.generate")}
            </Button>
          }
        />
      )}
    </div>
  );
}

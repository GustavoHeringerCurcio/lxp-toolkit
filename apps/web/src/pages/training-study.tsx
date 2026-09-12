import { useEffect, useState } from "react";
import { Copy, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchTrainingSubjects, streamStudyGuide } from "@/api";
import type { TrainingSubject } from "@/types";
import { useT } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";
import { TrainingSubjectPicker } from "@/components/training-subject-picker";
import { NoData } from "@/components/state-screens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export function TrainingStudyPage() {
  const { t } = useT();
  const { courseId, moduleId } = useTrainingState();

  const [subjects, setSubjects] = useState<TrainingSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

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

  const ask = async () => {
    if (!courseId) {
      toast.error(t("study.pickSubjectFirst"));
      return;
    }
    const query = question.trim();
    if (!query) {
      toast.error(t("study.needQuestion"));
      return;
    }
    setAsking(true);
    setAnswer("");
    try {
      await streamStudyGuide({ courseId, moduleId, query }, (e) => {
        if (e.type === "delta" && e.delta) setAnswer((prev) => prev + e.delta);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("study.error"));
    } finally {
      setAsking(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(answer);
    toast.success(t("study.copied"));
  };

  if (loadingSubjects) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("nav.trainingStudy")}</h1>
        <p className="text-sm text-muted-foreground">{t("study.intro")}</p>
      </header>

      <TrainingSubjectPicker subjects={subjects} disabled={asking} />

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("study.placeholder")}
          rows={3}
          disabled={asking}
          aria-label={t("study.placeholder")}
        />
        <div className="flex justify-end gap-2">
          {answer && (
            <Button variant="ghost" disabled={asking} onClick={() => { setAnswer(""); setQuestion(""); }}>
              {t("study.newQuestion")}
            </Button>
          )}
          <Button disabled={asking || !courseId || !question.trim()} onClick={() => void ask()}>
            {asking ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {asking ? t("study.asking") : t("study.ask")}
          </Button>
        </div>
      </div>

      {(answer || asking) && (
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
              <Sparkles className="size-3.5" aria-hidden />
              {t("study.answerTitle")}
            </span>
            {answer && !asking && (
              <Button variant="ghost" size="sm" onClick={() => void copy()}>
                <Copy aria-hidden />
                {t("study.copy")}
              </Button>
            )}
          </div>
          <div className={cn("whitespace-pre-wrap text-sm leading-relaxed", asking && !answer && "text-muted-foreground")}>
            {answer || t("study.thinking")}
            {asking && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand align-middle" aria-hidden />}
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, Sparkles, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  completeTrainingQuiz,
  fetchTrainingStats,
  fetchTrainingSubjects,
  generateTrainingQuiz,
  type TrainingAnswerDto,
} from "@/api";
import type { TrainingQuiz, TrainingQuizMode, TrainingStats, TrainingSubject } from "@/types";
import { useT } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";
import { scorePct, verdictFor } from "@/lib/training";
import { TrainingSubjectPicker } from "@/components/training-subject-picker";
import { ProgressRing } from "@/components/agora-hero";
import { NoData } from "@/components/state-screens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Phase = "setup" | "loading" | "playing" | "result";
type AnswerMap = Record<number, TrainingAnswerDto>;

const COUNTS = [10, 20, 30];

export function TrainingQuizPage() {
  const { t } = useT();
  const { courseId, moduleId } = useTrainingState();

  const [subjects, setSubjects] = useState<TrainingSubject[]>([]);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  const [mode, setMode] = useState<TrainingQuizMode>("ai");
  const [count, setCount] = useState(10);
  const [phase, setPhase] = useState<Phase>("setup");
  const [quiz, setQuiz] = useState<TrainingQuiz | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [score, setScore] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, st] = await Promise.all([fetchTrainingSubjects(), fetchTrainingStats()]);
        if (!alive) return;
        setSubjects(s);
        setStats(st);
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

  const current = quiz?.questions[index] ?? null;

  const start = useCallback(async () => {
    if (!courseId) return;
    setPhase("loading");
    try {
      const generated = await generateTrainingQuiz({ courseId, moduleId, mode, count });
      setQuiz(generated);
      setIndex(0);
      setChosen(null);
      setAnswers({});
      setScore(0);
      setPhase("playing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("training.error"));
      setPhase("setup");
    }
  }, [courseId, moduleId, mode, count, t]);

  const finish = useCallback(
    async (finalScore: number, finalAnswers: AnswerMap) => {
      setPhase("result");
      if (quiz) {
        const payload = quiz.questions.map(
          (q) => finalAnswers[q.id] ?? { questionId: q.id, chosenIndex: null, isCorrect: false },
        );
        try {
          await completeTrainingQuiz(quiz.id, payload, finalScore);
          setStats(await fetchTrainingStats());
        } catch {
          // the score is still shown even if persisting failed
        }
      }
    },
    [quiz],
  );

  const choose = (i: number) => {
    if (!current || chosen !== null) return;
    const correct = i === current.answerIndex;
    const nextAnswers = { ...answers, [current.id]: { questionId: current.id, chosenIndex: i, isCorrect: correct } };
    setAnswers(nextAnswers);
    setChosen(i);
    if (correct) setScore((s) => s + 1);
  };

  const next = () => {
    if (!quiz) return;
    if (index + 1 >= quiz.questions.length) {
      const finalScore = score;
      void finish(finalScore, answers);
      return;
    }
    setIndex((i) => i + 1);
    setChosen(null);
  };

  const reset = () => {
    setQuiz(null);
    setPhase("setup");
  };

  if (loadingSubjects) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
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

  const pct = scorePct(score, quiz?.total ?? 0);
  const verdict = verdictFor(pct);
  const wrong = quiz ? quiz.total - score : 0;
  const realCount = quiz ? quiz.questions.filter((q) => q.sourceItemId != null).length : 0;
  const aiCount = quiz ? quiz.total - realCount : 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      {phase === "setup" && (
        <>
          <header className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("nav.trainingQuiz")}</h1>
            <p className="text-sm text-muted-foreground">{t("training.quizIntro")}</p>
          </header>

          <TrainingSubjectPicker subjects={subjects} />

          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("training.mode")}
              </span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "ai" as const, label: t("training.modeAi"), hint: t("training.modeAiHint") },
                    { value: "mixed" as const, label: t("training.modeMixed"), hint: t("training.modeMixedHint") },
                  ]
                ).map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    aria-pressed={mode === m.value}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mode === m.value
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {m.value === "ai" ? <Sparkles className="size-3.5" aria-hidden /> : null}
                      {m.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("training.count")}
              </span>
              <div className="flex gap-2">
                {COUNTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCount(c)}
                    aria-pressed={count === c}
                    className={cn(
                      "rounded-full border px-4 py-1 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      count === c
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full" disabled={!courseId} onClick={() => void start()}>
              {t("training.start")}
            </Button>
          </div>

          {stats && stats.attempts > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Trophy className="size-4 text-soon" aria-hidden />
                {t("training.history")}
              </span>
              <span className="text-muted-foreground">
                {t("training.attempts")}: <span className="font-mono tabular-nums">{stats.attempts}</span>
              </span>
              <span className="text-muted-foreground">
                {t("training.best")}: <span className="font-mono tabular-nums text-ok">{stats.bestPct}%</span>
              </span>
              <span className="text-muted-foreground">
                {t("training.last")}: <span className="font-mono tabular-nums">{stats.lastPct}%</span>
              </span>
            </div>
          )}
        </>
      )}

      {phase === "loading" && (
        <div className="flex min-h-[40svh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <p className="text-sm">{t("training.generating")}</p>
        </div>
      )}

      {phase === "playing" && quiz && current && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate font-medium">{quiz.subjectLabel}</span>
              <span className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
                {quiz.mode === "mixed" && (
                  <span className="rounded-full border border-border px-2 py-0.5 font-sans text-[10px] text-muted-foreground">
                    {t("training.mixedTag")}
                  </span>
                )}
                {index + 1}/{quiz.total} · {score} {t("training.hits")}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300 ease-soft"
                style={{ width: `${((index + (chosen !== null ? 1 : 0)) / quiz.total) * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="font-heading text-lg font-medium leading-snug text-balance">{current.text}</p>

            <div className="mt-4 space-y-2">
              {current.options.map((opt, i) => {
                const reveal = chosen !== null;
                const isCorrect = i === current.answerIndex;
                const isChosen = chosen === i;
                return (
                  <button
                    key={opt.letter}
                    type="button"
                    disabled={reveal}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !reveal && "hover:border-primary/40 hover:bg-accent/40",
                      reveal && isCorrect && "border-ok/50 bg-ok-bg text-ok",
                      reveal && isChosen && !isCorrect && "border-late/50 bg-late-bg text-late",
                      reveal && !isCorrect && !isChosen && "opacity-60",
                    )}
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[11px] uppercase">
                      {reveal && isCorrect ? (
                        <Check className="size-3" aria-hidden />
                      ) : reveal && isChosen ? (
                        <X className="size-3" aria-hidden />
                      ) : (
                        opt.letter
                      )}
                    </span>
                    <span className="min-w-0 flex-1">{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {chosen !== null && current.explanation && (
              <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-[13px] leading-relaxed">
                <span className="font-medium">{t("training.explanation")}: </span>
                {current.explanation}
              </div>
            )}
          </div>

          <Button className="w-full" disabled={chosen === null} onClick={next}>
            {index + 1 >= quiz.total ? t("training.finish") : t("training.next")}
          </Button>
        </>
      )}

      {phase === "result" && quiz && (
        <>
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center">
            <ProgressRing done={score} total={quiz.total} size={128} ariaLabel={t("training.score", { score, total: quiz.total })} />
            <div>
              <p className={cn("font-heading text-xl font-semibold", verdict.cls)}>{t(verdict.key)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("training.score", { score, total: quiz.total })} · {pct}%
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("training.selfCheck")}</p>
            </div>
            <div className="flex gap-6 text-sm">
              <span className="text-ok">
                <span className="font-mono tabular-nums">{score}</span> {t("training.correctPlural")}
              </span>
              <span className="text-late">
                <span className="font-mono tabular-nums">{wrong}</span> {t("training.wrongPlural")}
              </span>
            </div>
            {quiz.mode === "mixed" && (
              <p className="text-[11px] text-muted-foreground">
                {t("training.mixedSummary", { real: realCount, ai: aiCount })}
              </p>
            )}
            {stats && (
              <p className="text-xs text-muted-foreground">
                {t("training.best")}: <span className="font-mono tabular-nums">{stats.bestPct}%</span> ·{" "}
                {t("training.attempts")}: <span className="font-mono tabular-nums">{stats.attempts}</span>
              </p>
            )}
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={() => void start()}>
                <RotateCcw aria-hidden />
                {t("training.retry")}
              </Button>
              <Button variant="outline" className="flex-1" onClick={reset}>
                {t("training.newQuiz")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

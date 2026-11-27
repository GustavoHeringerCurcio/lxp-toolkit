import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ExternalLink,
  GraduationCap,
  ListChecks,
  NotebookText,
  Sparkles,
} from "lucide-react";
import { fetchAssessment } from "@/api";
import type { Assessment } from "@/types";
import { fmtDeadline } from "@/lib/status";
import { useT, type TranslateFn } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";

function statusLabel(assessment: Assessment, t: TranslateFn): string {
  if (assessment.status === "graded") return t("assessment.graded");
  if (assessment.status === "submitted") return t("assessment.submitted");
  if (assessment.status === "expired") return t("assessment.expired");
  return t("assessment.pending");
}

function statusTone(assessment: Assessment): string {
  if (assessment.done) return "border-ok/30 bg-ok-bg text-ok";
  if (assessment.status === "expired") return "border-late/30 bg-late-bg text-late";
  return "border-soon/40 bg-soon-bg text-foreground";
}

export function AssessmentPage() {
  const { gradebookId } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useT();
  const { setCourseId, setModuleId, setExamId } = useTrainingState();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const id = Number(gradebookId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    if (!Number.isFinite(id) || id <= 0) {
      setError(t("assessment.notFound"));
      setLoading(false);
      return;
    }
    fetchAssessment(id)
      .then((payload) => {
        if (alive) setAssessment(payload.assessment);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, t]);

  const prepare = (path: string): void => {
    if (!assessment) return;
    setCourseId(assessment.courseId);
    setModuleId(null);
    setExamId(null);
    navigate(path);
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <Link to="/calendario" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-1 text-muted-foreground")}>
          <ChevronLeft />
          {t("assessment.back")}
        </Link>
        <NoData title={t("assessment.notFound")} detail={error ?? ""} />
      </div>
    );
  }

  const inPerson = assessment.topicTypeId === 27;
  const linkedTask =
    assessment.linkStatus === "linked" &&
    assessment.matchedContentItemId != null &&
    ["file_upload", "quiz", "forum"].includes(assessment.matchedKind ?? "");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <Link
        to="/calendario"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-1 text-muted-foreground")}
      >
        <ChevronLeft />
        {t("assessment.back")}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-soon/40 bg-soon-bg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
            <GraduationCap className="size-3.5" aria-hidden />
            {inPerson ? t("assessment.inPerson") : t("assessment.gradebookOnly")}
          </span>
          <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", statusTone(assessment))}>
            {statusLabel(assessment, t)}
          </span>
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{assessment.title}</h1>
        <p className="text-sm text-muted-foreground">
          {assessment.courseName}
          {assessment.categoryName ? ` · ${assessment.categoryName}` : ""}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("assessment.deadline")}
          </div>
          <div className="mt-1 font-heading text-sm font-semibold">
            {assessment.deadlineAt ? fmtDeadline(assessment.deadlineAt, locale) : t("calendar.noDeadline")}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("assessment.worth")}
          </div>
          <div className="mt-1 font-heading text-sm font-semibold">
            {assessment.maxValue != null
              ? t("assessment.points", { max: assessment.maxValue })
              : "—"}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("assessment.grade")}
          </div>
          <div className="mt-1 font-heading text-sm font-semibold">
            {assessment.value != null && assessment.maxValue != null
              ? t("assessment.gradeValue", {
                  value: assessment.value,
                  max: assessment.maxValue,
                })
              : "—"}
          </div>
        </div>
      </section>

      {inPerson && (
        <section className="rounded-xl border border-soon/40 bg-soon-bg p-4 sm:p-5">
          <h2 className="font-heading text-sm font-semibold">{t("assessment.inPerson")}</h2>
          <p className="mt-1 text-sm text-foreground/90">{t("assessment.inPersonBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => prepare("/treino/resumo")}>
              <NotebookText aria-hidden />
              {t("assessment.summary")}
            </Button>
            <Button variant="outline" onClick={() => prepare("/treino/quiz")}>
              <ListChecks aria-hidden />
              {t("assessment.quiz")}
            </Button>
            <Button variant="outline" onClick={() => prepare("/treino/estudo")}>
              <Sparkles aria-hidden />
              {t("assessment.ask")}
            </Button>
          </div>
        </section>
      )}

      {!inPerson && (
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">{t("assessment.gradebookBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => prepare("/treino/resumo")}>
              <NotebookText aria-hidden />
              {t("assessment.summary")}
            </Button>
            <Button variant="outline" onClick={() => prepare("/treino/quiz")}>
              <ListChecks aria-hidden />
              {t("assessment.quiz")}
            </Button>
            <Button variant="outline" onClick={() => prepare("/treino/estudo")}>
              <Sparkles aria-hidden />
              {t("assessment.ask")}
            </Button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {linkedTask && assessment.matchedContentItemId != null && (
          <Button onClick={() => navigate(`/tarefa/${assessment.matchedContentItemId}`)}>
            {t("assessment.openTask")}
          </Button>
        )}
        <a
          href={assessment.portalUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex items-center gap-1.5")}
        >
          {t("assessment.openPortal")}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

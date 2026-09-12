import { useEffect } from "react";
import { BookOpen, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrainingSubject } from "@/types";
import { useT } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";

/**
 * The shared "switch the data" control: pick the course (matéria) and, optionally,
 * the module (tópico) the AI should be an expert on. Used by both Treino routes.
 */
export function TrainingSubjectPicker({
  subjects,
  disabled,
  className,
}: {
  subjects: TrainingSubject[];
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const { courseId, moduleId, setCourseId, setModuleId } = useTrainingState();

  // Keep the selection valid as the catalog loads/changes.
  useEffect(() => {
    if (subjects.length === 0) return;
    const known = courseId != null && subjects.some((s) => s.courseId === courseId);
    if (!known) setCourseId(subjects[0].courseId);
  }, [subjects, courseId, setCourseId]);

  const course = subjects.find((s) => s.courseId === courseId) ?? null;
  const modules = course?.modules ?? [];

  if (subjects.length === 0) {
    return (
      <div className={cn("rounded-xl border bg-card p-4 text-sm text-muted-foreground", className)}>
        {t("training.noSubjects")}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4", className)}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("training.subject")}
          </span>
          <div className="relative">
            <GraduationCap
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <select
              value={courseId ?? ""}
              onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
              disabled={disabled}
              aria-label={t("training.subject")}
              className="w-full appearance-none rounded-lg border bg-background py-2 pl-9 pr-8 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {subjects.map((s) => (
                <option key={s.courseId} value={s.courseId}>
                  {s.courseName}
                </option>
              ))}
            </select>
          </div>
        </label>

        {course && (
          <div className="flex shrink-0 items-center gap-3 pb-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" aria-hidden />
              {t("training.stats", { q: course.quizCount, r: course.readingCount })}
            </span>
          </div>
        )}
      </div>

      {modules.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("training.module")}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setModuleId(null)}
            aria-pressed={moduleId === null}
            className={chipCls(moduleId === null)}
          >
            {t("training.allModules")}
          </button>
          {modules.map((m) => (
            <button
              key={m.moduleId}
              type="button"
              disabled={disabled}
              onClick={() => setModuleId(moduleId === m.moduleId ? null : m.moduleId)}
              aria-pressed={moduleId === m.moduleId}
              className={chipCls(moduleId === m.moduleId)}
            >
              {m.moduleName}
              {m.quizCount > 0 && (
                <span className="ml-1 font-mono text-[10px] tabular-nums opacity-70">{m.quizCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function chipCls(active: boolean): string {
  return cn(
    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
    active
      ? "border-primary/50 bg-primary/10 text-primary"
      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
  );
}

import { useEffect, useRef } from "react";
import { BookOpen, GraduationCap, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrainingSubject } from "@/types";
import { useT } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";

/**
 * The shared "switch the data" control: pick the course, then the subject
 * (matéria = module — DBI, ARS…). The AI's knowledge pack is scoped to the
 * chosen subject; the exam phase is picked separately.
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

  // Keep the course valid as the catalog loads/changes.
  useEffect(() => {
    if (subjects.length === 0) return;
    const known = courseId != null && subjects.some((s) => s.courseId === courseId);
    if (!known) setCourseId(subjects[0].courseId);
  }, [subjects, courseId, setCourseId]);

  const course = subjects.find((s) => s.courseId === courseId) ?? null;
  const modules = course?.modules ?? [];
  const subjectModules = modules.filter((m) => m.isSubject);
  const otherModules = modules.filter((m) => !m.isSubject);
  const selectedModule = modules.find((m) => m.moduleId === moduleId) ?? null;
  const defaultedFor = useRef<number | null>(null);

  // Default to the first real subject once per course (subject-level study);
  // the student can still pick "Todas as matérias" or an exam module afterwards.
  useEffect(() => {
    if (!course || modules.length === 0) return;
    if (defaultedFor.current === course.courseId) return;
    defaultedFor.current = course.courseId;
    if (moduleId == null || !modules.some((m) => m.moduleId === moduleId)) {
      const fallback = subjectModules[0] ?? modules[0];
      setModuleId(fallback.moduleId);
    }
  }, [course, modules, subjectModules, moduleId, setModuleId]);

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
            {t("training.course")}
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
              aria-label={t("training.course")}
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

        {modules.length > 0 && (
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("training.subject")}
            </span>
            <div className="relative">
              <Layers
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <select
                value={moduleId ?? ""}
                onChange={(e) => setModuleId(e.target.value ? Number(e.target.value) : null)}
                disabled={disabled}
                aria-label={t("training.subject")}
                className="w-full appearance-none rounded-lg border bg-background py-2 pl-9 pr-8 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <option value="">{t("training.allModules")}</option>
                {subjectModules.length > 0 && (
                  <optgroup label={t("training.subjects")}>
                    {subjectModules.map((m) => (
                      <option key={m.moduleId} value={m.moduleId}>
                        {m.moduleName}
                        {m.quizCount > 0 ? ` (${m.quizCount})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherModules.length > 0 && (
                  <optgroup label={t("training.others")}>
                    {otherModules.map((m) => (
                      <option key={m.moduleId} value={m.moduleId}>
                        {m.moduleName}
                        {m.quizCount > 0 ? ` (${m.quizCount})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </label>
        )}

        {course && (
          <div className="flex shrink-0 items-center gap-3 pb-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" aria-hidden />
              {selectedModule
                ? t("training.statsSubject", {
                    name: selectedModule.moduleName,
                    q: selectedModule.quizCount,
                    r: selectedModule.readingCount,
                  })
                : t("training.stats", { q: course.quizCount, r: course.readingCount })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

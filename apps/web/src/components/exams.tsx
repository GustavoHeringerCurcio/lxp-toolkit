import { useCallback, useEffect, useState } from "react";
import { CalendarCog, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExam, fetchExamOverview, saveExam, setExamScope } from "@/api";
import type { ExamOverview } from "@/types";
import { useT } from "@/lib/i18n";
import { useTrainingState } from "@/lib/training-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface DraftExam {
  id?: number;
  name: string;
  sequence: number;
  endsAt: string | null;
}

function useExamOverview(courseId: number | null) {
  const [overview, setOverview] = useState<ExamOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!courseId) {
      setOverview(null);
      return;
    }
    setLoading(true);
    try {
      setOverview(await fetchExamOverview(courseId));
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [courseId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { overview, loading, reload, setOverview };
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
}

/** Create/rename/date-and-delete the exam phases of a course. */
function ExamDateEditor({
  courseId,
  overview,
  onChanged,
}: {
  courseId: number | null;
  overview: ExamOverview | null;
  onChanged: () => void | Promise<void>;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<DraftExam[]>([]);
  const [busy, setBusy] = useState(false);
  const savedExams = overview?.exams ?? [];
  const suggestions = overview?.suggested ?? [];

  useEffect(() => {
    setDraft(
      savedExams.map((e) => ({ id: e.id, name: e.name, sequence: e.sequence, endsAt: e.endsAt })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview?.exams]);

  const patch = (index: number, next: Partial<DraftExam>) => {
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));
  };

  const save = async () => {
    if (!courseId) return;
    setBusy(true);
    try {
      const existing = new Set(savedExams.map((e) => e.id));
      const kept = new Set<number>();
      let seq = 1;
      for (const row of draft) {
        const name = row.name.trim();
        if (!name) continue;
        const res = await saveExam({
          id: row.id,
          courseId,
          name,
          sequence: seq++,
          endsAt: row.endsAt,
        });
        kept.add(res.exam.id);
      }
      for (const id of existing) if (!kept.has(id)) await deleteExam(id);
      await onChanged();
      toast.success(t("exams.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("exams.desc")}</p>

      {draft.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("exams.empty")}
        </p>
      )}

      <div className="space-y-2">
        {draft.map((row, index) => (
          <div key={row.id ?? `new-${index}`} className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("exams.name")}
              </span>
              <Input
                value={row.name}
                onChange={(ev) => patch(index, { name: ev.target.value })}
                placeholder={t("exams.namePlaceholder")}
              />
            </label>
            <label className="w-40 shrink-0">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("exams.endsAt")}
              </span>
              <Input
                type="date"
                value={row.endsAt ? row.endsAt.slice(0, 10) : ""}
                onChange={(ev) =>
                  patch(index, { endsAt: ev.target.value ? new Date(ev.target.value).toISOString() : null })
                }
              />
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("exams.remove")}
              onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setDraft((prev) => [...prev, { name: "", sequence: prev.length + 1, endsAt: null }])
          }
        >
          <Plus aria-hidden />
          {t("exams.add")}
        </Button>
        {suggestions.length > 0 && draft.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft(suggestions.map((s) => ({ name: s.name, sequence: s.sequence, endsAt: s.endsAt })))
            }
          >
            <Wand2 aria-hidden />
            {t("exams.importGradebook")}
          </Button>
        )}
        <Button size="sm" className="ml-auto" disabled={busy || !courseId} onClick={() => void save()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("exams.saveExams")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The compact Prova selector shown on the Resumo/Treino screens, with an inline
 * editor for the exam dates (the full subject→exam mapping lives in Ajustes).
 */
export function ExamPicker({ courseId, disabled }: { courseId: number | null; disabled?: boolean }) {
  const { t } = useT();
  const { examId, setExamId } = useTrainingState();
  const { overview, loading, reload } = useExamOverview(courseId);
  const [open, setOpen] = useState(false);
  const exams = overview?.exams ?? [];

  useEffect(() => {
    if (examId != null && overview && !exams.some((e) => e.id === examId)) setExamId(null);
  }, [examId, overview, exams, setExamId]);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("exams.label")}
        </span>
        <div className="relative">
          <CalendarCog
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <select
            value={examId ?? ""}
            onChange={(ev) => setExamId(ev.target.value ? Number(ev.target.value) : null)}
            disabled={disabled || loading || exams.length === 0}
            aria-label={t("exams.label")}
            className="w-full appearance-none rounded-lg border bg-background py-2 pl-9 pr-8 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <option value="">{t("exams.all")}</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.endsAt ? ` · ${fmtShortDate(e.endsAt)}` : ""}
              </option>
            ))}
          </select>
        </div>
      </label>
      <Button variant="outline" size="sm" className="mb-0.5" onClick={() => setOpen(true)} disabled={!courseId}>
        <CalendarCog aria-hidden />
        {t("exams.edit")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("exams.title")}</DialogTitle>
            <DialogDescription>{t("exams.longDesc")}</DialogDescription>
          </DialogHeader>
          <ExamDateEditor courseId={courseId} overview={overview} onChanged={reload} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Full Provas editor for Ajustes: dates + subject/section → exam assignment. */
export function ExamSettings() {
  const { t } = useT();
  const { courseId } = useTrainingState();
  const { overview, loading, reload, setOverview } = useExamOverview(courseId);

  const assign = async (scopeType: "module" | "section", scopeId: number, examId: number | null) => {
    if (!courseId) return;
    try {
      const next = await setExamScope({ courseId, scopeType, scopeId, examId });
      setOverview(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const bulkNeutral = async () => {
    if (!courseId || !overview || overview.exams.length === 0) return;
    const target = overview.exams[0];
    const neutral = overview.assignments.filter((a) => a.examId == null);
    try {
      for (const a of neutral) {
        await setExamScope({ courseId, scopeType: a.scopeType, scopeId: a.scopeId, examId: target.id });
      }
      await reload();
      toast.success(t("exams.bulkDone"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (!courseId) {
    return <p className="text-sm text-muted-foreground">{t("exams.pickCourse")}</p>;
  }

  const exams = overview?.exams ?? [];
  const modules = (overview?.assignments ?? [])
    .filter((a) => a.scopeType === "module")
    .sort((a, b) => a.title.localeCompare(b.title, "pt"));
  const sectionsByModule = new Map<number, typeof modules>();
  for (const a of overview?.assignments ?? []) {
    if (a.scopeType !== "section" || a.moduleId == null) continue;
    const list = sectionsByModule.get(a.moduleId) ?? [];
    list.push(a);
    sectionsByModule.set(a.moduleId, list);
  }

  const examSelect = (value: number | null, onChange: (v: number | null) => void) => (
    <Select
      value={value == null ? "" : String(value)}
      onChange={(ev) => onChange(ev.target.value ? Number(ev.target.value) : null)}
      disabled={exams.length === 0}
      className="w-44"
      aria-label={t("exams.label")}
    >
      <option value="">{t("exams.neutral")}</option>
      {exams.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-5">
      <ExamDateEditor courseId={courseId} overview={overview} onChanged={reload} />

      {loading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("exams.loading")}
        </p>
      )}

      {overview && exams.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {t("exams.unclassified", { n: overview.unclassified, total: overview.totalItems })}
            </span>
            {overview.unclassified > 0 && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => void bulkNeutral()}>
                {t("exams.bulkNeutral", { name: exams[0].name })}
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {modules.map((mod) => {
              const sections = (sectionsByModule.get(mod.scopeId) ?? []).sort((a, b) =>
                a.title.localeCompare(b.title, "pt"),
              );
              return (
                <div key={`m-${mod.scopeId}`} className="rounded-lg border">
                  <div className="flex items-center gap-3 border-b px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{mod.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("exams.items", { n: mod.itemCount })}
                        {mod.source === "manual" ? ` · ${t("exams.sourceManual")}` : ""}
                      </p>
                    </div>
                    {examSelect(mod.examId, (v) => void assign("module", mod.scopeId, v))}
                  </div>
                  {sections.length > 0 && (
                    <div className="divide-y">
                      {sections.map((section) => (
                        <div key={`s-${section.scopeId}`} className="flex items-center gap-3 px-3 py-1.5 pl-6">
                          <div className="min-w-0 flex-1">
                            <p className={cn("truncate text-[13px]", !section.title && "text-muted-foreground")}>
                              {section.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {t("exams.items", { n: section.itemCount })}
                              {section.source === "manual" ? ` · ${t("exams.sourceManual")}` : ""}
                            </p>
                          </div>
                          {examSelect(section.examId, (v) => void assign("section", section.scopeId, v))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {overview && exams.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("exams.needExams")}</p>
      )}
    </div>
  );
}

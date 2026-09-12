import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData, useScopePrefs } from "@/lib/app-state";
import { countInfo } from "@/lib/status";
import { useT } from "@/lib/i18n";
import { KIND_ORDER, kindShort } from "@/lib/kind";
import type { ExerciseKind } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";

/** Type stays monochrome (icon/label elsewhere); a neutral ramp keeps the bars distinct without colliding with status colors. */
const TYPE_BAR: Record<ExerciseKind, string> = {
  quiz: "bg-muted-foreground/70",
  upload: "bg-muted-foreground/50",
  forum: "bg-muted-foreground/40",
  mark: "bg-muted-foreground/30",
  other: "bg-muted-foreground/15",
};

function SkeletonMain() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-44 rounded-xl" />
    </div>
  );
}

function StackedBar({ done, open, late }: { done: number; open: number; late: number }) {
  const total = Math.max(done + open + late, 1);
  return (
    <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
      <span className="bg-ok" style={{ width: `${(done / total) * 100}%` }} />
      <span className="bg-late" style={{ width: `${(late / total) * 100}%` }} />
      <span className="bg-coming" style={{ width: `${(open / total) * 100}%` }} />
    </span>
  );
}

export function ProgressoPage() {
  const { items, loading } = useAppData();
  const { setModuleFilter } = useScopePrefs();
  const { t } = useT();
  const navigate = useNavigate();

  const counts = useMemo(() => countInfo(items), [items]);

  const modules = useMemo(() => {
    const map = new Map<string, { name: string; done: number; open: number; late: number; total: number }>();
    for (const e of items) {
      if (!e.moduleName) continue;
      const m = map.get(e.moduleName) ?? { name: e.moduleName, done: 0, open: 0, late: 0, total: 0 };
      m.total += 1;
      if (e.status === "done" || e.done) m.done += 1;
      else if (e.status === "expired") m.late += 1;
      else m.open += 1;
      map.set(e.moduleName, m);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [items]);

  const types = useMemo(() => {
    const c: Record<ExerciseKind, number> = { quiz: 0, upload: 0, forum: 0, mark: 0, other: 0 };
    for (const e of items) c[e.kind] += 1;
    return KIND_ORDER.map((k) => ({ kind: k, count: c[k] }));
  }, [items]);

  if (loading && items.length === 0) return <SkeletonMain />;

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <NoData title={t("progress.emptyTitle")} detail={t("progress.emptyDetail")} />
      </div>
    );
  }

  const total = items.length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      {/* overall */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { label: t("scope.open"), value: counts.open, cls: "text-coming" },
            { label: t("scope.expired"), value: counts.expired, cls: "text-late" },
            { label: t("scope.done"), value: counts.done, cls: "text-ok" },
          ] as const
        ).map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <div className="font-heading text-2xl font-semibold tabular-nums sm:text-3xl">
              <span className={k.cls}>{k.value}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* per module */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">{t("progress.byModule")}</h2>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> {t("progress.legendDone")}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-late" /> {t("progress.legendLate")}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-coming" /> {t("progress.legendOpen")}</span>
          </div>
        </div>
        <div className="space-y-4">
          {modules.map((m) => (
            <div key={m.name}>
              <button
                type="button"
                onClick={() => {
                  setModuleFilter(m.name);
                  navigate("/tarefas");
                }}
                className="group mb-1.5 flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate text-[13px] font-medium group-hover:text-primary">{m.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {m.done}/{m.total}
                </span>
              </button>
              <StackedBar done={m.done} open={m.open} late={m.late} />
            </div>
          ))}
        </div>
      </section>

      {/* per type */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 font-heading text-sm font-semibold">{t("progress.byType")}</h2>
        <div className="space-y-3">
          {types.map(({ kind, count }) => (
            <div key={kind} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[13px] text-muted-foreground">{kindShort(kind, t)}</span>
              <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={TYPE_BAR[kind]} style={{ width: `${(count / total) * 100}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {count}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

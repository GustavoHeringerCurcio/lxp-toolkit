import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
} from "lucide-react";
import { fetchCalendar } from "@/api";
import type { CalendarEvent } from "@/types";
import { useT, type TranslateFn } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { NoData } from "@/components/state-screens";

const TZ = "America/Sao_Paulo";

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Monday-first 6-week grid. */
function buildGrid(cursor: Date): Date[] {
  const first = startOfMonth(cursor);
  const weekday = (first.getDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function eventTone(event: CalendarEvent): string {
  if (event.done || event.status === "done" || event.status === "submitted" || event.status === "graded") {
    return "border-ok/30 bg-ok-bg text-ok";
  }
  if (event.status === "expired") return "border-late/30 bg-late-bg text-late";
  if (event.kind === "assessment") return "border-soon/40 bg-soon-bg text-foreground";
  if (event.kind === "appointment") return "border-border bg-muted/40 text-muted-foreground";
  return "border-coming/30 bg-coming-bg text-coming";
}

function EventIcon({ event }: { event: CalendarEvent }) {
  if (event.kind === "assessment") return <GraduationCap className="size-3 shrink-0" aria-hidden />;
  if (event.kind === "appointment") return <CalendarClock className="size-3 shrink-0" aria-hidden />;
  return <BookOpen className="size-3 shrink-0" aria-hidden />;
}

function statusLabel(event: CalendarEvent, t: TranslateFn): string {
  if (event.done || event.status === "done" || event.status === "submitted" || event.status === "graded") {
    if (event.status === "graded") return t("calendar.graded");
    if (event.status === "submitted") return t("calendar.submitted");
    return t("calendar.legend.done");
  }
  if (event.status === "expired") return t("calendar.legend.expired");
  if (event.status === "pending") return t("calendar.pending");
  return t("calendar.legend.open");
}

function SkeletonCalendar() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Skeleton className="h-10 w-72 rounded-lg" />
      <Skeleton className="h-[36rem] w-full rounded-xl" />
    </div>
  );
}

export function CalendarioPage() {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const from = dateKey(startOfMonth(cursor));
  const to = dateKey(endOfMonth(cursor));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCalendar(from, to)
      .then((payload) => {
        if (!cancelled) setEvents(payload.events);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const grid = useMemo(() => buildGrid(cursor), [cursor]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(cursor),
    [cursor, locale],
  );
  const weekdays = useMemo(() => {
    const base = new Date(2026, 0, 5); // Monday
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(addDays(base, index)),
    );
  }, [locale]);

  const todayKey = dateKey(new Date());
  const counts = useMemo(() => {
    const assessments = events.filter((event) => event.kind === "assessment" && !event.done).length;
    const late = events.filter((event) => event.status === "expired").length;
    return { assessments, late };
  }, [events]);

  function openEvent(event: CalendarEvent): void {
    if (event.canOpenTask && event.activityId != null) {
      navigate(`/tarefa/${event.activityId}`);
      return;
    }
    if (event.kind === "assessment" && event.gradebookId != null) {
      navigate(`/avaliacao/${event.gradebookId}`);
      return;
    }
    setSelected(event);
  }

  if (loading && events.length === 0) return <SkeletonCalendar />;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("calendar.prev")}
            onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("calendar.next")}
            onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <h1 className="font-heading text-xl font-semibold capitalize tracking-tight">{monthLabel}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCursor(startOfMonth(new Date()))}
          className="ml-auto"
        >
          {t("calendar.today")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>{t("calendar.counts", { events: events.length, assessments: counts.assessments, late: counts.late })}</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-coming" /> {t("calendar.legend.open")}</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-soon" /> {t("calendar.legend.assessment")}</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-late" /> {t("calendar.legend.expired")}</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> {t("calendar.legend.done")}</span>
      </div>

      {error && <NoData title={t("calendar.empty")} detail={error} />}
      {events.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">{t("calendar.emptyDetail")}</p>
      )}
      {(
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {weekdays.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day) => {
              const key = dateKey(day);
              const dayEvents = byDay.get(key) ?? [];
              const inMonth = day.getMonth() === cursor.getMonth();
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[7.5rem] border-b border-r p-1.5",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                        key === todayKey && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(key)}
                        className="text-[10px] font-medium text-primary hover:underline"
                      >
                        +{dayEvents.length - 3}
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.key}
                        type="button"
                        onClick={() => openEvent(event)}
                        title={`${event.title} — ${statusLabel(event, t)}`}
                        className={cn(
                          "flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left text-[10px] leading-tight transition-opacity hover:opacity-80",
                          eventTone(event),
                        )}
                      >
                        {event.done ? <Check className="size-3 shrink-0" aria-hidden /> : <EventIcon event={event} />}
                        <span className="truncate">{event.title}</span>
                        {event.grade != null && (
                          <span className="ml-auto shrink-0 font-mono tabular-nums">
                            {event.grade.toFixed(1).replace(".0", "")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>
                  {selected.kind === "assessment"
                    ? t("calendar.assessment")
                    : selected.kind === "appointment"
                      ? t("calendar.appointment")
                      : t("calendar.task")}
                  {selected.courseName ? ` · ${selected.courseName}` : ""}
                  {selected.moduleName ? ` · ${selected.moduleName}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("calendar.noDeadline")}</span>
                  <span className="font-medium">
                    {selected.startAt
                      ? new Intl.DateTimeFormat(locale, {
                          timeZone: TZ,
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(selected.startAt))
                      : selected.date}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("calendar.legend.assessment")}</span>
                  <span className="font-medium">{statusLabel(selected, t)}</span>
                </div>
                {selected.maxGrade != null && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t("calendar.worth", { max: selected.maxGrade })}</span>
                    <span className="font-mono tabular-nums">
                      {selected.grade != null
                        ? t("calendar.grade", { value: selected.grade, max: selected.maxGrade })
                        : "—"}
                    </span>
                  </div>
                )}
              </div>
              <DialogFooter>
                {selected.canOpenTask && selected.activityId != null && (
                  <Button onClick={() => navigate(`/tarefa/${selected.activityId}`)}>
                    {t("calendar.openTask")}
                  </Button>
                )}
                {selected.portalUrl && (
                  <a
                    href={selected.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  >
                    {t("calendar.openPortal")}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
                <Button variant="outline" onClick={() => setSelected(null)}>
                  {t("calendar.close")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={selectedDay != null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent>
          {selectedDay && (
            <>
              <DialogHeader>
                <DialogTitle className="capitalize">
                  {new Intl.DateTimeFormat(locale, {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  }).format(new Date(`${selectedDay}T12:00:00-03:00`))}
                </DialogTitle>
                <DialogDescription>{t("calendar.counts", {
                  events: (byDay.get(selectedDay) ?? []).length,
                  assessments: (byDay.get(selectedDay) ?? []).filter((e) => e.kind === "assessment" && !e.done).length,
                  late: (byDay.get(selectedDay) ?? []).filter((e) => e.status === "expired").length,
                })}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                {(byDay.get(selectedDay) ?? []).map((event) => (
                  <button
                    key={event.key}
                    type="button"
                    onClick={() => {
                      setSelectedDay(null);
                      openEvent(event);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs",
                      eventTone(event),
                    )}
                  >
                    {event.done ? <Check className="size-3.5 shrink-0" /> : <EventIcon event={event} />}
                    <span className="truncate">{event.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] uppercase opacity-80">
                      {statusLabel(event, t)}
                    </span>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedDay(null)}>
                  {t("calendar.close")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

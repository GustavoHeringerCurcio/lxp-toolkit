import { query } from "./db.js";
import { getStudentId } from "./store.js";
import type {
  Assessment,
  AssessmentLinkStatus,
  AssessmentStatus,
  CalendarEvent,
} from "./types.js";

const TZ = "America/Sao_Paulo";

/**
 * College portal origin. Never use `LXP_PUBLIC_URL` here: that is the app's
 * Tailscale/Vercel URL, not the college. `LXP_PORTAL_URL` is explicit; fall back
 * to the origin of the scraper's `LXP_URL`, then the known host.
 */
function portalBaseUrl(): string {
  const explicit = process.env.LXP_PORTAL_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const scraper = process.env.LXP_URL?.trim();
  if (scraper) {
    try {
      return new URL(scraper).origin;
    } catch {
      /* invalid LXP_URL */
    }
  }
  return "https://unifoa2.grupoa.education";
}

function portalCourseUrl(courseId: number, topicId?: number | null): string {
  const base = `${portalBaseUrl()}/plataforma/course/${courseId}`;
  return topicId != null ? `${base}/content/${topicId}` : base;
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** YYYY-MM-DD in the student's timezone (São Paulo). */
export function localDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function rangeBounds(from?: string, to?: string): { start: Date; end: Date; fromKey: string; toKey: string } {
  const now = new Date();
  const defaultFrom = `${localDateKey(now).slice(0, 7)}-01`;
  const defaultTo = localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const fromKey = /^\d{4}-\d{2}-\d{2}$/.test(from ?? "") ? from! : defaultFrom;
  const toKey = /^\d{4}-\d{2}-\d{2}$/.test(to ?? "") ? to! : defaultTo;
  const start = new Date(`${fromKey}T00:00:00-03:00`);
  const end = new Date(`${toKey}T00:00:00-03:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end, fromKey, toKey };
}

function assessmentStatus(row: {
  value: string | null;
  max_value: string | null;
  is_submitted: boolean;
  submitted_at: Date | null;
  deadline_at: Date | null;
}): AssessmentStatus {
  if (row.value != null && row.value !== "") return "graded";
  if (row.is_submitted || row.submitted_at != null) return "submitted";
  if (row.deadline_at && row.deadline_at.getTime() < Date.now()) return "expired";
  return "pending";
}

interface AssessmentRow {
  id: string;
  course_id: string;
  course_name: string;
  category_id: string | null;
  category_name: string | null;
  title: string;
  deadline_at: Date | null;
  topic_type_id: number | null;
  value: string | null;
  max_value: string | null;
  is_submitted: boolean;
  submitted_at: Date | null;
  link_status: string;
  matched_content_item_id: string | null;
  matched_title: string | null;
  matched_kind: string | null;
}

function toAssessment(row: AssessmentRow): Assessment {
  const status = assessmentStatus(row);
  const linkStatus = (row.link_status as AssessmentLinkStatus) ?? "gradebook_only";
  const matchedContentItemId =
    row.matched_content_item_id != null ? Number(row.matched_content_item_id) : null;
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    courseName: row.course_name,
    categoryId: row.category_id != null ? Number(row.category_id) : null,
    categoryName: row.category_name ?? "Avaliações",
    title: row.title,
    deadlineAt: isoDate(row.deadline_at),
    topicTypeId: row.topic_type_id,
    value: numberOrNull(row.value),
    maxValue: numberOrNull(row.max_value),
    isSubmitted: row.is_submitted === true,
    submittedAt: isoDate(row.submitted_at),
    status,
    done: status === "graded" || status === "submitted",
    matchedContentItemId,
    matchedTitle: row.matched_title,
    matchedKind: row.matched_kind,
    linkStatus,
    portalUrl: portalCourseUrl(
      Number(row.course_id),
      linkStatus === "linked" ? matchedContentItemId : null,
    ),
  };
}

/**
 * All gradebook assessments, optionally limited to a deadline range.
 * This is the authoritative list for graded activities — including exams that
 * have no current content-tree topic (e.g. AVD1 SOMATIVA).
 */
export async function listAssessments(from?: string, to?: string): Promise<Assessment[]> {
  const { start, end } = rangeBounds(from, to);
  const range = from || to;
  const params = range ? [start, end] : [];
  const where = range
    ? "WHERE ga.deadline_at IS NOT NULL AND ga.deadline_at >= $1 AND ga.deadline_at < $2"
    : "";
  const rows = await query<AssessmentRow>(
    `SELECT ga.id, ga.course_id, c.name AS course_name,
            ga.category_id, gc.name AS category_name,
            ga.name AS title, ga.deadline_at, ga.topic_type_id,
            ga.value::text AS value, ga.max_value::text AS max_value,
            ga.is_submitted, ga.submitted_at, ga.link_status,
            ga.matched_content_item_id,
            ci.title AS matched_title, ci.kind AS matched_kind
       FROM gradebook_activity ga
       JOIN course c ON c.id = ga.course_id
       LEFT JOIN gradebook_category gc ON gc.id = ga.category_id
       LEFT JOIN content_item ci ON ci.id = ga.matched_content_item_id
       ${where}
      ORDER BY ga.deadline_at NULLS LAST, ga.name`,
    params,
  );
  return rows.map(toAssessment);
}

/** One assessment by gradebook id (for the in-app detail page). */
export async function getAssessment(id: number): Promise<Assessment | null> {
  const rows = await query<AssessmentRow>(
    `SELECT ga.id, ga.course_id, c.name AS course_name,
            ga.category_id, gc.name AS category_name,
            ga.name AS title, ga.deadline_at, ga.topic_type_id,
            ga.value::text AS value, ga.max_value::text AS max_value,
            ga.is_submitted, ga.submitted_at, ga.link_status,
            ga.matched_content_item_id,
            ci.title AS matched_title, ci.kind AS matched_kind
       FROM gradebook_activity ga
       JOIN course c ON c.id = ga.course_id
       LEFT JOIN gradebook_category gc ON gc.id = ga.category_id
       LEFT JOIN content_item ci ON ci.id = ga.matched_content_item_id
      WHERE ga.id = $1
      LIMIT 1`,
    [id],
  );
  return rows[0] ? toAssessment(rows[0]) : null;
}

interface TaskRow {
  id: string;
  title: string;
  course_id: string;
  course_name: string;
  module_name: string | null;
  section_title: string | null;
  deadline_at: Date;
  kind: string;
  topic_type_id: number;
  done: boolean | null;
  student_grade: string | null;
  grade: string | null;
  manual_status: string | null;
}

/** One content-tree task with a deadline in the calendar range. */
async function listDeadlineTasks(from: string, to: string, studentId: number): Promise<TaskRow[]> {
  const { start, end } = rangeBounds(from, to);
  return query<TaskRow>(
    `SELECT v.id, v.title, v.course_id, v.course_name, v.module_name, v.section_title,
            v.deadline_at, v.kind, v.topic_type_id,
            st.done, st.student_grade::text AS student_grade, st.grade::text AS grade,
            ia.manual_status
       FROM v_exercise_current v
       LEFT JOIN LATERAL (
         SELECT done, student_grade, grade
           FROM item_state
          WHERE content_item_id = v.id
          ORDER BY captured_at DESC, id DESC
          LIMIT 1
       ) st ON true
       LEFT JOIN item_annotation ia
         ON ia.content_item_id = v.id AND ia.student_id = $3
      WHERE v.origin = 'tree'
        AND v.deadline_at IS NOT NULL
        AND v.deadline_at >= $1
        AND v.deadline_at < $2`,
    [start, end, studentId],
  );
}

interface AppointmentRow {
  id: string;
  title: string;
  start_at: Date | null;
  end_at: Date | null;
  is_all_day: boolean;
  entity_type: string | null;
  topic_id: string | null;
  course_id: string | null;
  course_name: string | null;
  is_completed: boolean;
}

async function listAppointments(from: string, to: string): Promise<AppointmentRow[]> {
  const { start, end } = rangeBounds(from, to);
  return query<AppointmentRow>(
    `SELECT a.id, a.title, a.start_at, a.end_at, a.is_all_day, a.entity_type,
            a.topic_id, a.course_id, c.name AS course_name, a.is_completed
       FROM calendar_appointment a
       LEFT JOIN course c ON c.id = a.course_id
      WHERE a.start_at IS NOT NULL
        AND a.start_at >= $1
        AND a.start_at < $2
      ORDER BY a.start_at, a.title`,
    [start, end],
  );
}

function taskStatus(done: boolean | null, deadline: Date): "open" | "expired" | "done" {
  if (done) return "done";
  return deadline.getTime() < Date.now() ? "expired" : "open";
}

/**
 * Merged calendar: portal appointments + content-tree tasks + gradebook
 * assessments. Linked assessments and appointments are folded into their task
 * so one day cell never shows the same activity twice.
 */
export async function listCalendar(from?: string, to?: string): Promise<CalendarEvent[]> {
  const { fromKey, toKey } = rangeBounds(from, to);
  const studentId = await getStudentId();
  const [appointments, tasks, assessments] = await Promise.all([
    listAppointments(fromKey, toKey),
    listDeadlineTasks(fromKey, toKey, studentId),
    listAssessments(fromKey, toKey),
  ]);

  const events = new Map<string, CalendarEvent>();
  const taskByItemId = new Map<number, CalendarEvent>();

  for (const task of tasks) {
    const deadline = task.deadline_at;
    const done = task.done === true || task.manual_status === "done";
    const event: CalendarEvent = {
      key: `task:${task.id}`,
      kind: "task",
      id: String(task.id),
      title: task.title,
      date: localDateKey(deadline),
      startAt: isoDate(deadline),
      endAt: null,
      allDay: false,
      courseId: Number(task.course_id),
      courseName: task.course_name,
      moduleName: task.module_name,
      sectionTitle: task.section_title,
      status: taskStatus(done, deadline),
      done,
      grade: numberOrNull(task.student_grade),
      maxGrade: numberOrNull(task.grade),
      activityId: Number(task.id),
      gradebookId: null,
      topicTypeId: task.topic_type_id,
      linkStatus: null,
      canOpenTask: true,
      portalUrl: null,
    };
    events.set(event.key, event);
    taskByItemId.set(Number(task.id), event);
  }

  for (const assessment of assessments) {
    const linked = assessment.matchedContentItemId;
    const task = linked != null ? taskByItemId.get(linked) : undefined;
    if (task) {
      // Fold the gradebook result into the linked task (ARS, BDI, LPW…).
      task.gradebookId = assessment.id;
      task.linkStatus = assessment.linkStatus;
      task.maxGrade = assessment.maxValue ?? task.maxGrade;
      if (assessment.value != null) task.grade = assessment.value;
      if (assessment.done) {
        task.done = true;
        task.status = "done";
      } else if (task.status === "open" && assessment.status === "expired") {
        task.status = "expired";
      }
      continue;
    }

    const date = assessment.deadlineAt ? localDateKey(assessment.deadlineAt) : fromKey;
    const key = `assessment:${assessment.id}`;
    events.set(key, {
      key,
      kind: "assessment",
      id: String(assessment.id),
      title: assessment.title,
      date,
      startAt: assessment.deadlineAt,
      endAt: null,
      allDay: true,
      courseId: assessment.courseId,
      courseName: assessment.courseName,
      moduleName: assessment.categoryName,
      sectionTitle: null,
      status: assessment.status,
      done: assessment.done,
      grade: assessment.value,
      maxGrade: assessment.maxValue,
      activityId: null,
      gradebookId: assessment.id,
      topicTypeId: assessment.topicTypeId,
      linkStatus: assessment.linkStatus,
      canOpenTask: false,
      portalUrl: assessment.portalUrl,
    });
  }

  for (const appointment of appointments) {
    const topicId = appointment.topic_id != null ? Number(appointment.topic_id) : null;
    const task = topicId != null ? taskByItemId.get(topicId) : undefined;
    if (task) {
      // The portal calendar announces the same task; enrich its time.
      task.startAt = isoDate(appointment.start_at) ?? task.startAt;
      task.endAt = isoDate(appointment.end_at);
      task.allDay = appointment.is_all_day === true;
      continue;
    }

    const key = `appointment:${appointment.id}`;
    const start = appointment.start_at ?? new Date();
    const completed = appointment.is_completed === true;
    events.set(key, {
      key,
      kind: "appointment",
      id: String(appointment.id),
      title: appointment.title,
      date: localDateKey(start),
      startAt: isoDate(appointment.start_at),
      endAt: isoDate(appointment.end_at),
      allDay: appointment.is_all_day === true,
      courseId: appointment.course_id != null ? Number(appointment.course_id) : null,
      courseName: appointment.course_name,
      moduleName: null,
      sectionTitle: null,
      status: completed ? "done" : start.getTime() < Date.now() ? "expired" : "open",
      done: completed,
      grade: null,
      maxGrade: null,
      activityId: null,
      gradebookId: null,
      topicTypeId: null,
      linkStatus: null,
      canOpenTask: false,
      portalUrl:
        appointment.course_id != null
          ? portalCourseUrl(Number(appointment.course_id))
          : portalBaseUrl(),
    });
  }

  return [...events.values()].sort((a, b) => {
    const da = a.startAt ?? `${a.date}T00:00:00-03:00`;
    const db = b.startAt ?? `${b.date}T00:00:00-03:00`;
    return da.localeCompare(db) || a.title.localeCompare(b.title, "pt-BR");
  });
}

export { portalBaseUrl };

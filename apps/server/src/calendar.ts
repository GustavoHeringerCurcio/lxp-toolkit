import { existsSync, readFileSync } from "node:fs";
import { query } from "./db.js";
import { raw } from "./paths.js";

interface RawAppointment {
  id?: number;
  title?: string;
  startAt?: string | null;
  endAt?: string | null;
  isAllDay?: boolean;
  appointmentCategoryId?: number | null;
  entityType?: string | null;
  isCompleted?: boolean;
  academicMain?: { academicMainId?: number; academicMainTitle?: string }[];
}

interface SurfacesFile {
  surfaces?: {
    "calendar-appointments"?: RawAppointment[];
  };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface CalendarImportSummary {
  appointments: number;
}

/**
 * Persist portal calendar appointments. The dump only keeps a rolling window in
 * `surfaces.json`; the DB keeps history so the calendar can still show the
 * early days of the month after the window moves.
 */
export async function importCalendar(): Promise<CalendarImportSummary> {
  const file = raw("surfaces.json");
  if (!existsSync(file)) return { appointments: 0 };
  let data: SurfacesFile;
  try {
    data = JSON.parse(readFileSync(file, "utf-8")) as SurfacesFile;
  } catch {
    return { appointments: 0 };
  }
  const appointments = data.surfaces?.["calendar-appointments"] ?? [];
  if (appointments.length === 0) return { appointments: 0 };

  const courses = await query<{ id: string }>("SELECT id FROM course");
  const courseIds = new Set(courses.map((row) => Number(row.id)));

  let imported = 0;
  for (const appointment of appointments) {
    const id = Number(appointment.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const mains = Array.isArray(appointment.academicMain) ? appointment.academicMain : [];
    const academicMainId = Number(mains[0]?.academicMainId ?? 0) || null;
    const topicId = appointment.entityType === "topic" ? id : null;
    const courseId =
      academicMainId != null && courseIds.has(academicMainId) ? academicMainId : null;

    await query(
      `INSERT INTO calendar_appointment(
         id, course_id, title, start_at, end_at, is_all_day, entity_type,
         topic_id, academic_main_id, category_id, is_completed, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         title = EXCLUDED.title,
         start_at = EXCLUDED.start_at,
         end_at = EXCLUDED.end_at,
         is_all_day = EXCLUDED.is_all_day,
         entity_type = EXCLUDED.entity_type,
         topic_id = EXCLUDED.topic_id,
         academic_main_id = EXCLUDED.academic_main_id,
         category_id = EXCLUDED.category_id,
         is_completed = EXCLUDED.is_completed,
         updated_at = now()`,
      [
        id,
        courseId,
        appointment.title ?? `Compromisso ${id}`,
        parseDate(appointment.startAt),
        parseDate(appointment.endAt),
        appointment.isAllDay === true,
        appointment.entityType ?? null,
        topicId,
        academicMainId,
        appointment.appointmentCategoryId ?? null,
        appointment.isCompleted === true,
      ],
    );
    imported++;
  }
  return { appointments: imported };
}

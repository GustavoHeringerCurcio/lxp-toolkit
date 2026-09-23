/**
 * Gradebook import — read the structured grades surface once and store it.
 *
 * `dump-surfaces` writes `scraped/raw/surfaces.json` with the full
 * `/v1/plataforma/grades/me/course/:id` payload per course. The gradebook
 * categories (AVD1, AVD2, Substitutiva…) are the authoritative exam phases, and
 * each evaluation `id` bridges a graded topic via `content_item.gradebook_id`.
 *
 * Importing it lets the exam classifier reuse the gradebook and lets the Provas
 * editor propose default exam phases (name + end date) with no manual setup.
 */
import { existsSync, readFileSync } from "node:fs";
import { query } from "./db.js";
import { raw } from "./paths.js";

interface GradebookLeaf {
  id?: number;
  name?: string;
  deadlineAt?: string | null;
  topicTypeId?: number | null;
  children?: GradebookLeaf[];
}

interface GradebookNode {
  id?: number;
  name?: string;
  sequence?: number | null;
  children?: GradebookLeaf[];
}

interface GradebookSurface {
  finalGrade?: unknown;
  structure?: GradebookNode[];
}

interface SurfacesFile {
  grades?: Record<string, GradebookSurface>;
}

export interface GradebookImportSummary {
  categories: number;
  activities: number;
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Import the gradebook structure for every course present in surfaces.json. */
export async function importGradebook(): Promise<GradebookImportSummary> {
  const file = raw("surfaces.json");
  if (!existsSync(file)) return { categories: 0, activities: 0 };

  let data: SurfacesFile;
  try {
    data = JSON.parse(readFileSync(file, "utf-8")) as SurfacesFile;
  } catch {
    return { categories: 0, activities: 0 };
  }
  const grades = data.grades ?? {};

  const courses = await query<{ id: string; name: string }>("SELECT id, name FROM course");
  const byExact = new Map(courses.map((c) => [c.name, Number(c.id)]));
  const byNorm = new Map(courses.map((c) => [normalized(c.name), Number(c.id)]));

  let categories = 0;
  let activities = 0;

  for (const [courseName, gb] of Object.entries(grades)) {
    const courseId = byExact.get(courseName) ?? byNorm.get(normalized(courseName));
    if (!courseId) continue;

    for (let ci = 0; ci < (gb.structure ?? []).length; ci++) {
      const cat = gb.structure![ci];
      if (!cat?.id || !cat.name) continue;
      await query(
        `INSERT INTO gradebook_category(id, course_id, name, sequence, updated_at)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (id) DO UPDATE SET
           course_id = EXCLUDED.course_id,
           name = EXCLUDED.name,
           sequence = EXCLUDED.sequence,
           updated_at = now()`,
        [Number(cat.id), courseId, cat.name, cat.sequence ?? ci + 1],
      );
      categories++;

      for (const child of cat.children ?? []) {
        if (!child?.id || !child.name) continue;
        await query(
          `INSERT INTO gradebook_activity(id, course_id, category_id, name, deadline_at, topic_type_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6, now())
           ON CONFLICT (id) DO UPDATE SET
             course_id = EXCLUDED.course_id,
             category_id = EXCLUDED.category_id,
             name = EXCLUDED.name,
             deadline_at = EXCLUDED.deadline_at,
             topic_type_id = EXCLUDED.topic_type_id,
             updated_at = now()`,
          [
            Number(child.id),
            courseId,
            Number(cat.id),
            child.name,
            child.deadlineAt ? new Date(child.deadlineAt) : null,
            child.topicTypeId != null ? Number(child.topicTypeId) : null,
          ],
        );
        activities++;
      }
    }
  }

  return { categories, activities };
}

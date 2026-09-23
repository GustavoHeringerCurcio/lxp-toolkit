/**
 * Exam persistence + overview ("Provas").
 *
 * Owns the `course_exam` phases and the manual scope overrides, and assembles
 * the Ajustes → Provas overview (per-module/section assignment + unclassified
 * count + gradebook-derived suggestions).
 */
import { query } from "./db.js";
import { getStudentId } from "./store.js";
import {
  keywordExamOrder,
  majorityExamId,
  pickExamByOrder,
  resolveCourseExams,
  type ClassifiableItem,
  type ExamClassifyMaps,
  type ExamResolutionSource,
} from "./exams.js";
import type { Exam, ExamAssignmentInfo, ExamOverview, ExamSuggestion } from "./types.js";

interface ExamRow {
  id: string;
  course_id: string;
  name: string;
  sequence: number;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toExam(row: ExamRow): Exam {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    name: row.name,
    sequence: row.sequence,
    endsAt: row.ends_at ? row.ends_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listExams(courseId: number): Promise<Exam[]> {
  const studentId = await getStudentId();
  const rows = await query<ExamRow>(
    "SELECT * FROM course_exam WHERE student_id = $1 AND course_id = $2 ORDER BY sequence, id",
    [studentId, courseId],
  );
  return rows.map(toExam);
}

export interface SaveExamInput {
  id?: number;
  name: string;
  sequence: number;
  endsAt?: string | null;
}

export async function saveExam(courseId: number, input: SaveExamInput): Promise<Exam> {
  const studentId = await getStudentId();
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (input.id) {
    const rows = await query<ExamRow>(
      `UPDATE course_exam SET name = $3, sequence = $4, ends_at = $5, updated_at = now()
       WHERE id = $1 AND student_id = $2 RETURNING *`,
      [input.id, studentId, input.name, input.sequence, endsAt],
    );
    if (rows[0]) return toExam(rows[0]);
  }
  const rows = await query<ExamRow>(
    `INSERT INTO course_exam(student_id, course_id, name, sequence, ends_at, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (student_id, course_id, sequence) DO UPDATE SET
       name = EXCLUDED.name,
       ends_at = EXCLUDED.ends_at,
       updated_at = now()
     RETURNING *`,
    [studentId, courseId, input.name, input.sequence, endsAt],
  );
  return toExam(rows[0]);
}

export async function deleteExam(id: number): Promise<void> {
  const studentId = await getStudentId();
  await query("DELETE FROM course_exam WHERE id = $1 AND student_id = $2", [id, studentId]);
}

export type ScopeType = "module" | "section" | "item";

/** Assign (or clear, with `null`) one scope to an exam. */
export async function setScopeExam(
  scopeType: ScopeType,
  scopeId: number,
  examId: number | null,
): Promise<void> {
  const studentId = await getStudentId();
  if (scopeType === "module") {
    if (examId == null) {
      await query("DELETE FROM module_exam WHERE student_id = $1 AND module_id = $2", [studentId, scopeId]);
    } else {
      await query(
        `INSERT INTO module_exam(student_id, module_id, exam_id, source, updated_at)
         VALUES ($1,$2,$3,'manual', now())
         ON CONFLICT (student_id, module_id) DO UPDATE SET exam_id = EXCLUDED.exam_id, source = 'manual', updated_at = now()`,
        [studentId, scopeId, examId],
      );
    }
    return;
  }
  if (scopeType === "section") {
    if (examId == null) {
      await query("DELETE FROM section_exam WHERE student_id = $1 AND section_id = $2", [studentId, scopeId]);
    } else {
      await query(
        `INSERT INTO section_exam(student_id, section_id, exam_id, source, updated_at)
         VALUES ($1,$2,$3,'manual', now())
         ON CONFLICT (student_id, section_id) DO UPDATE SET exam_id = EXCLUDED.exam_id, source = 'manual', updated_at = now()`,
        [studentId, scopeId, examId],
      );
    }
    return;
  }
  if (examId == null) {
    await query(
      "UPDATE item_annotation SET exam_id = NULL, updated_at = now() WHERE student_id = $1 AND content_item_id = $2",
      [studentId, scopeId],
    );
  } else {
    await query(
      `INSERT INTO item_annotation(content_item_id, student_id, exam_id, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (content_item_id, student_id) DO UPDATE SET exam_id = EXCLUDED.exam_id, updated_at = now()`,
      [scopeId, studentId, examId],
    );
  }
}

async function classifyItems(courseId: number): Promise<ClassifiableItem[]> {
  const rows = await query<{
    id: string;
    module_id: string | null;
    module_title: string | null;
    section_id: string | null;
    section_title: string | null;
    gradebook_id: string | null;
    deadline_at: Date | null;
  }>(
    `SELECT ci.id, ci.module_id, m.title AS module_title, ci.section_id, s.title AS section_title,
            ci.gradebook_id, ci.deadline_at
     FROM content_item ci
     LEFT JOIN module m ON m.id = ci.module_id
     LEFT JOIN section s ON s.id = ci.section_id
     WHERE ci.course_id = $1`,
    [courseId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    moduleId: r.module_id != null ? Number(r.module_id) : null,
    moduleTitle: r.module_title,
    sectionId: r.section_id != null ? Number(r.section_id) : null,
    sectionTitle: r.section_title,
    gradebookId: r.gradebook_id != null ? Number(r.gradebook_id) : null,
    deadlineAt: r.deadline_at ? r.deadline_at.toISOString() : null,
  }));
}

/** Manual override maps + the gradebook-bridge map for the classifier. */
export async function getClassifyMaps(courseId: number, exams: Exam[]): Promise<ExamClassifyMaps> {
  const studentId = await getStudentId();
  const [itemRows, sectionRows, moduleRows, gbRows] = await Promise.all([
    query<{ content_item_id: string; exam_id: string }>(
      `SELECT ia.content_item_id, ia.exam_id
       FROM item_annotation ia JOIN content_item ci ON ci.id = ia.content_item_id
       WHERE ci.course_id = $1 AND ia.student_id = $2 AND ia.exam_id IS NOT NULL`,
      [courseId, studentId],
    ),
    query<{ section_id: string; exam_id: string }>(
      `SELECT se.section_id, se.exam_id
       FROM section_exam se JOIN section s ON s.id = se.section_id
       JOIN module m ON m.id = s.module_id
       WHERE m.course_id = $1 AND se.student_id = $2`,
      [courseId, studentId],
    ),
    query<{ module_id: string; exam_id: string }>(
      `SELECT me.module_id, me.exam_id
       FROM module_exam me JOIN module m ON m.id = me.module_id
       WHERE m.course_id = $1 AND me.student_id = $2`,
      [courseId, studentId],
    ),
    query<{ id: string; activity_name: string; category_name: string | null }>(
      `SELECT ga.id, ga.name AS activity_name, gc.name AS category_name
       FROM gradebook_activity ga
       LEFT JOIN gradebook_category gc ON gc.id = ga.category_id
       WHERE ga.course_id = $1`,
      [courseId],
    ),
  ]);

  const itemExam = new Map(itemRows.map((r) => [Number(r.content_item_id), Number(r.exam_id)]));
  const sectionExam = new Map(sectionRows.map((r) => [Number(r.section_id), Number(r.exam_id)]));
  const moduleExam = new Map(moduleRows.map((r) => [Number(r.module_id), Number(r.exam_id)]));
  const gradebookExam = new Map<number, number>();
  for (const r of gbRows) {
    const order = keywordExamOrder(r.category_name) ?? keywordExamOrder(r.activity_name);
    if (order == null) continue;
    const examId = pickExamByOrder(exams, order);
    if (examId != null) gradebookExam.set(Number(r.id), examId);
  }

  return { itemExam, sectionExam, moduleExam, gradebookExam };
}

/** Gradebook-derived exam proposals (name + end date), when none are saved. */
export async function suggestExams(courseId: number): Promise<ExamSuggestion[]> {
  const rows = await query<{ name: string; sequence: number | null; ends_at: Date | null }>(
    `SELECT gc.name, gc.sequence, max(ga.deadline_at) AS ends_at
     FROM gradebook_category gc
     LEFT JOIN gradebook_activity ga ON ga.category_id = gc.id
     WHERE gc.course_id = $1
     GROUP BY gc.id, gc.name, gc.sequence
     ORDER BY gc.sequence NULLS LAST, gc.id`,
    [courseId],
  );
  const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

  const byOrder = (order: number) => rows.find((r) => keywordExamOrder(r.name) === order);
  const sub = rows.find((r) => /substitutiv|recupera|final/i.test(r.name));

  const suggestions: ExamSuggestion[] = [];
  const first = byOrder(1);
  if (first) suggestions.push({ name: "AVD1", sequence: 1, endsAt: iso(first.ends_at) });
  const second = byOrder(2);
  if (second) suggestions.push({ name: "AVD2", sequence: 2, endsAt: iso(second.ends_at) });
  if (sub) suggestions.push({ name: "Substitutiva", sequence: suggestions.length + 1, endsAt: iso(sub.ends_at) });

  if (suggestions.length === 0) {
    for (const r of rows.slice(0, 2)) {
      suggestions.push({ name: r.name, sequence: suggestions.length + 1, endsAt: iso(r.ends_at) });
    }
  }
  return suggestions;
}

interface ScopeAccumulator {
  scopeType: "module" | "section";
  scopeId: number;
  title: string;
  moduleId: number | null;
  itemCount: number;
  examIds: number[];
}

function scopeSource(
  examId: number | null,
  manual: boolean,
): ExamResolutionSource {
  if (manual) return "manual";
  return examId == null ? "neutral" : "auto";
}

/** Everything the Provas editor needs for a course. */
export async function getExamOverview(courseId: number): Promise<ExamOverview> {
  const exams = await listExams(courseId);
  const items = await classifyItems(courseId);
  const maps = await getClassifyMaps(courseId, exams);
  const resolved = resolveCourseExams(items, exams, maps);

  const modules = new Map<number, ScopeAccumulator>();
  const sections = new Map<number, ScopeAccumulator>();

  for (const item of items) {
    const r = resolved.get(item.id);
    const examId = r?.examId ?? null;
    if (item.moduleId != null) {
      const acc =
        modules.get(item.moduleId) ??
        {
          scopeType: "module" as const,
          scopeId: item.moduleId,
          title: item.moduleTitle ?? "Sem matéria",
          moduleId: item.moduleId,
          itemCount: 0,
          examIds: [],
        };
      acc.itemCount++;
      if (examId != null) acc.examIds.push(examId);
      modules.set(item.moduleId, acc);
    }
    if (item.sectionId != null) {
      const acc =
        sections.get(item.sectionId) ??
        {
          scopeType: "section" as const,
          scopeId: item.sectionId,
          title: item.sectionTitle ?? "Seção",
          moduleId: item.moduleId,
          itemCount: 0,
          examIds: [],
        };
      acc.itemCount++;
      if (examId != null) acc.examIds.push(examId);
      sections.set(item.sectionId, acc);
    }
  }

  const assignments: ExamAssignmentInfo[] = [];
  for (const acc of modules.values()) {
    const examId = majorityExamId(acc.examIds);
    assignments.push({
      scopeType: "module",
      scopeId: acc.scopeId,
      title: acc.title,
      courseId,
      moduleId: acc.moduleId,
      itemCount: acc.itemCount,
      examId,
      source: scopeSource(examId, maps.moduleExam?.has(acc.scopeId) ?? false),
    });
  }
  for (const acc of sections.values()) {
    const examId = majorityExamId(acc.examIds);
    assignments.push({
      scopeType: "section",
      scopeId: acc.scopeId,
      title: acc.title,
      courseId,
      moduleId: acc.moduleId,
      itemCount: acc.itemCount,
      examId,
      source: scopeSource(examId, maps.sectionExam?.has(acc.scopeId) ?? false),
    });
  }

  const unclassified = items.filter((i) => resolved.get(i.id)?.source === "neutral").length;
  const suggested = exams.length === 0 ? await suggestExams(courseId) : [];

  return {
    exams,
    assignments,
    suggested,
    unclassified,
    totalItems: items.length,
  };
}

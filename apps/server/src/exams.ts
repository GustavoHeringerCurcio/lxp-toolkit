/**
 * Exam-phase classification (pure).
 *
 * Given a course's content items and its exam phases (`course_exam`), decide
 * which exam each item belongs to. Precedence (manual always wins):
 *
 *   1. item override            (`item_annotation.exam_id`)
 *   2. section override         (`section_exam`)
 *   3. module override          (`module_exam`)
 *   4. section/module keyword   ("1º Bimestre", "AVD2", "BIM 1"…)
 *   5. gradebook bridge         (`content_item.gradebook_id` → category)
 *   6. item deadline vs exam end dates
 *   7. majority of resolved siblings in the same section/module
 *   8. neutral                  (always included in every exam)
 *
 * The material is largely undated (PDFs/readings), which is why keyword +
 * manual overrides matter more than dates.
 */
import type { Exam } from "./types.js";

export type ExamResolutionSource = "manual" | "auto" | "neutral";

export interface ExamResolved {
  examId: number | null;
  source: ExamResolutionSource;
}

/** Narrow view of a content item the classifier needs. */
export interface ClassifiableItem {
  id: number;
  moduleId: number | null;
  moduleTitle: string | null;
  sectionId: number | null;
  sectionTitle: string | null;
  gradebookId: number | null;
  deadlineAt: string | null;
}

export interface ExamClassifyMaps {
  /** Manual per-item overrides (only non-null exam ids). */
  itemExam?: Map<number, number>;
  sectionExam?: Map<number, number>;
  moduleExam?: Map<number, number>;
  /** gradebook activity id → exam id (from the category name). */
  gradebookExam?: Map<number, number>;
}

export function normalizeExamText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const EXAM_TERM = "(?:bim|bimestre|avd|prova|p|etapa|periodo|somativa|formativa|modulo|unidade)";
const KEYWORD_AFTER = new RegExp(`\\b${EXAM_TERM}[^0-9]{0,6}([12])\\b`);
const KEYWORD_BEFORE = new RegExp(`\\b([12])\\s*[ºo°a]?\\s*${EXAM_TERM}\\b`);

/**
 * Which exam order (1, 2…) a section/module title refers to, if any.
 * Handles "1º Bimestre", "BIM 1", "AVD2", "P1", "Módulo 2", etc.
 */
export function keywordExamOrder(title: string | null | undefined): number | null {
  if (!title) return null;
  const t = normalizeExamText(title);
  const after = KEYWORD_AFTER.exec(t);
  if (after) return Number(after[1]);
  const before = KEYWORD_BEFORE.exec(t);
  if (before) return Number(before[1]);
  return null;
}

export function pickExamByOrder(exams: Exam[], order: number): number | null {
  const found = exams.find((e) => e.sequence === order);
  return found ? found.id : null;
}

/** The exam an item's date falls into (the first exam ending on/after it). */
export function classifyByDate(deadlineAt: string | null, exams: Exam[]): number | null {
  if (!deadlineAt) return null;
  const t = new Date(deadlineAt).getTime();
  if (Number.isNaN(t)) return null;
  const dated = exams
    .filter((e) => e.endsAt)
    .sort((a, b) => new Date(a.endsAt as string).getTime() - new Date(b.endsAt as string).getTime());
  if (dated.length === 0) return null;
  for (const e of dated) {
    if (t <= new Date(e.endsAt as string).getTime()) return e.id;
  }
  return dated[dated.length - 1].id;
}

function firstManual(
  values: (number | undefined)[],
): number | undefined {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
}

/** Direct (non-majority) signal for one item, or null when undecided. */
function directResolution(
  item: ClassifiableItem,
  exams: Exam[],
  maps: ExamClassifyMaps,
): ExamResolved | null {
  const itemOverride = maps.itemExam?.get(item.id);
  const sectionOverride =
    item.sectionId != null ? maps.sectionExam?.get(item.sectionId) : undefined;
  const moduleOverride =
    item.moduleId != null ? maps.moduleExam?.get(item.moduleId) : undefined;
  const manual = firstManual([itemOverride, sectionOverride, moduleOverride]);
  if (manual !== undefined) return { examId: manual, source: "manual" };

  const order =
    keywordExamOrder(item.sectionTitle) ?? keywordExamOrder(item.moduleTitle) ?? null;
  if (order != null) {
    const id = pickExamByOrder(exams, order);
    if (id != null) return { examId: id, source: "auto" };
  }

  if (item.gradebookId != null) {
    const gb = maps.gradebookExam?.get(item.gradebookId);
    if (gb !== undefined) return { examId: gb, source: "auto" };
  }

  const byDate = classifyByDate(item.deadlineAt, exams);
  if (byDate != null) return { examId: byDate, source: "auto" };

  return null;
}

/** Most common exam id among resolved values (ties go to the first seen). */
export function majorityExamId(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = -1;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Resolve every item to an exam. Items with only weak signals inherit the
 * majority verdict of their resolved siblings (same section, else module).
 */
export function resolveCourseExams(
  items: ClassifiableItem[],
  exams: Exam[],
  maps: ExamClassifyMaps = {},
): Map<number, ExamResolved> {
  const resolved = new Map<number, ExamResolved>();
  for (const item of items) {
    const direct = directResolution(item, exams, maps);
    if (direct) resolved.set(item.id, direct);
  }

  for (const item of items) {
    if (resolved.has(item.id)) continue;
    const sectionPeers =
      item.sectionId != null
        ? items.filter((i) => i.id !== item.id && i.sectionId === item.sectionId && resolved.has(i.id))
        : [];
    const modulePeers =
      item.moduleId != null
        ? items.filter(
            (i) =>
              i.id !== item.id &&
              i.sectionId == null &&
              item.sectionId == null &&
              i.moduleId === item.moduleId &&
              resolved.has(i.id),
          )
        : [];
    const peers = sectionPeers.length > 0 ? sectionPeers : modulePeers;
    const verdict = majorityExamId(
      peers.map((p) => resolved.get(p.id)!.examId).filter((v): v is number => v != null),
    );
    resolved.set(item.id, verdict != null ? { examId: verdict, source: "auto" } : { examId: null, source: "neutral" });
  }

  return resolved;
}

/** Keep items assigned to `examId` or neutral. `null` keeps everything. */
export function filterItemsForExam<T extends { id: number }>(
  items: T[],
  resolved: Map<number, ExamResolved>,
  examId: number | null,
): T[] {
  if (examId == null) return items;
  return items.filter((item) => {
    const r = resolved.get(item.id);
    return !r || r.examId == null || r.examId === examId;
  });
}

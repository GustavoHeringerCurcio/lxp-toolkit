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
  isSubmited?: boolean;
  value?: number | string | null;
  maxValue?: number | string | null;
  submitedAt?: string | null;
  isDeadlineExpired?: boolean;
  children?: GradebookLeaf[];
}

function numeric(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function timestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

export interface GradebookLinkSummary {
  linked: number;
  stale: number;
  gradebookOnly: number;
}

interface ContentLinkRow {
  id: string;
  course_id: string;
  title: string;
  deadline_at: Date | null;
  gradebook_id: string | null;
  kind: string;
}

interface GradebookLinkRow {
  id: string;
  course_id: string;
  name: string;
  deadline_at: Date | null;
  topic_type_id: number | null;
}

function normalizedTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Title without dates, so "AVD1 … 27/11/2026" and "AVD1 … 10/04/2026" compare equal. */
function baseTitle(value: string): string {
  return normalizedTitle(value)
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dayDiff(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function pickBest(
  candidates: ContentLinkRow[],
  gb: GradebookLinkRow,
): { row: ContentLinkRow; diff: number | null; titleMatch: boolean } | null {
  let best: { row: ContentLinkRow; diff: number | null; titleMatch: boolean } | null = null;
  const gbBase = baseTitle(gb.name);
  for (const row of candidates) {
    const diff = dayDiff(row.deadline_at, gb.deadline_at);
    const titleMatch = baseTitle(row.title) === gbBase;
    const score = (diff ?? Number.POSITIVE_INFINITY) + (titleMatch ? 0 : 1000);
    const bestScore =
      best == null
        ? Number.POSITIVE_INFINITY
        : (best.diff ?? Number.POSITIVE_INFINITY) + (best.titleMatch ? 0 : 1000);
    if (score < bestScore) best = { row, diff, titleMatch };
  }
  return best;
}

/**
 * Link gradebook activities to content items using the **current term**, not
 * only the reused `gradebook_id`.
 *
 * The portal reuses a gradebook activity id across terms. A current exam can
 * therefore point at an old hidden topic with the same id and a months-old
 * deadline; treating that old topic as the current assessment hides the real
 * pending exam. We only link when the deadline and title agree; otherwise the
 * link is `stale` and the current gradebook activity is shown as
 * `gradebook_only`.
 */
export async function reconcileGradebookLinks(): Promise<GradebookLinkSummary> {
  const [contentRows, gradebookRows] = await Promise.all([
    query<ContentLinkRow>(
      `SELECT id, course_id, title, deadline_at, gradebook_id, kind
         FROM content_item`,
    ),
    query<GradebookLinkRow>(
      `SELECT id, course_id, name, deadline_at, topic_type_id
         FROM gradebook_activity`,
    ),
  ]);

  const byCourse = new Map<number, ContentLinkRow[]>();
  for (const row of contentRows) {
    const key = Number(row.course_id);
    const list = byCourse.get(key) ?? [];
    list.push(row);
    byCourse.set(key, list);
  }

  let linked = 0;
  let stale = 0;
  let gradebookOnly = 0;

  for (const gb of gradebookRows) {
    const candidates = byCourse.get(Number(gb.course_id)) ?? [];
    const sameId = candidates.filter((row) => Number(row.gradebook_id) === Number(gb.id));
    const byId = pickBest(sameId, gb);
    let matched: ContentLinkRow | null = null;
    let status: "linked" | "stale" | "gradebook_only" = "gradebook_only";

    if (byId) {
      const closeDeadline = byId.diff != null && byId.diff <= 30;
      const veryClose = byId.diff != null && byId.diff <= 1;
      if (veryClose || (closeDeadline && byId.titleMatch)) {
        matched = byId.row;
        status = "linked";
      } else {
        // Same id, but an old term/topic: keep the historical topic out of the
        // current assessment and surface the gradebook activity itself.
        status = "stale";
      }
    } else {
      const gbBase = baseTitle(gb.name);
      const byTitle = candidates.filter(
        (row) =>
          baseTitle(row.title) === gbBase &&
          (dayDiff(row.deadline_at, gb.deadline_at) ?? 999) <= 30,
      );
      const best = pickBest(byTitle, gb);
      if (best) {
        matched = best.row;
        status = "linked";
      }
    }

    await query(
      `UPDATE gradebook_activity
          SET matched_content_item_id = $2, link_status = $3
        WHERE id = $1`,
      [Number(gb.id), matched ? Number(matched.id) : null, status],
    );

    if (status === "linked") linked++;
    else if (status === "stale") stale++;
    else gradebookOnly++;
  }

  return { linked, stale, gradebookOnly };
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
          `INSERT INTO gradebook_activity(
             id, course_id, category_id, name, deadline_at, topic_type_id,
             value, max_value, is_submitted, submitted_at, is_deadline_expired, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
           ON CONFLICT (id) DO UPDATE SET
             course_id = EXCLUDED.course_id,
             category_id = EXCLUDED.category_id,
             name = EXCLUDED.name,
             deadline_at = EXCLUDED.deadline_at,
             topic_type_id = EXCLUDED.topic_type_id,
             value = EXCLUDED.value,
             max_value = EXCLUDED.max_value,
             is_submitted = EXCLUDED.is_submitted,
             submitted_at = EXCLUDED.submitted_at,
             is_deadline_expired = EXCLUDED.is_deadline_expired,
             updated_at = now()`,
          [
            Number(child.id),
            courseId,
            Number(cat.id),
            child.name,
            child.deadlineAt ? new Date(child.deadlineAt) : null,
            child.topicTypeId != null ? Number(child.topicTypeId) : null,
            numeric(child.value),
            numeric(child.maxValue),
            child.isSubmited === true,
            timestamp(child.submitedAt),
            child.isDeadlineExpired === true,
          ],
        );
        activities++;
      }
    }
  }

  return { categories, activities };
}

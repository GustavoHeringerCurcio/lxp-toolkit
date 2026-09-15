import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { config, logger } from "../src/config.js";
import { ensureDir, json, resolveOut, slugify } from "../src/util.js";

interface RawItem {
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  sectionId: number | null;
  sectionTitle: string | null;
  itemId: number;
  itemTitle: string;
  topicTypeId: number;
  kind: string;
  done: boolean;
  viewed: boolean;
  grade: unknown;
  progressId: number | null;
  expired: boolean;
  deadlineAt: string | null;
  hasDeadline: boolean;
  attachments: { url: string; filename: string | null; filesize: number | null }[];
  /** `"hidden"` for God's Eye topics the portal does not list in the tree. */
  origin?: "tree" | "hidden";
}

interface Course { courseId: number; courseName: string; items: RawItem[] }

interface CompactItem {
  itemId: number;
  itemTitle: string;
  kind: string;
  done: boolean;
  expired: boolean;
  deadlineAt: string | null;
  hasDeadline: boolean;
  viewed: boolean;
  grade: unknown;
  localFiles: { name: string; relPath: string }[];
}

const DAY_MS = 86_400_000;

function daysLeft(deadlineAt: string | null): number | null {
  if (!deadlineAt) return null;
  const d = new Date(deadlineAt.replace(" ", "T")).getTime();
  return Math.floor((d - Date.now()) / DAY_MS);
}

function toRelSlash(p: string): string {
  return p.split(path.sep).join("/");
}

function buildCourseIndex(course: Course): {
  courseId: number;
  courseName: string;
  slugDir: string;
  items: CompactItem[];
  modules: { moduleId: number; moduleTitle: string; sections: { sectionId: number | null; sectionTitle: string | null; items: CompactItem[] }[] }[];
} {
  const slugDir = `${course.courseId}-${slugify(course.courseName)}`;
  const filesDir = path.resolve(resolveOut(config.outDir, "courses"), slugDir, "files");
  let fileNames: string[] = [];
  try {
    fileNames = readdirSync(filesDir);
  } catch {
    fileNames = [];
  }

  const localFilesFor = (itemId: number): { name: string; relPath: string }[] =>
    fileNames
      .filter((f) => f.startsWith(`${itemId}_`) || f.startsWith(`${itemId}.`) || f === String(itemId))
      .map((name) => ({
        name,
        relPath: toRelSlash(path.join(config.outDir, "courses", slugDir, "files", name)),
      }));

  const items: CompactItem[] = course.items.map((it) => ({
    itemId: it.itemId,
    itemTitle: it.itemTitle,
    kind: it.kind,
    done: it.done,
    expired: it.expired,
    deadlineAt: it.deadlineAt,
    hasDeadline: it.hasDeadline,
    viewed: it.viewed,
    grade: it.grade,
    localFiles: localFilesFor(it.itemId),
  }));

  // group by module then section (preserve course order)
  const byModule = new Map<number, { moduleId: number; moduleTitle: string; sections: Map<string, CompactItem[]> }>();
  for (const it of course.items) {
    if (!byModule.has(it.moduleId)) {
      byModule.set(it.moduleId, { moduleId: it.moduleId, moduleTitle: it.moduleTitle, sections: new Map() });
    }
    const mod = byModule.get(it.moduleId)!;
    const secKey = `${it.sectionId ?? "top"}|${it.sectionTitle ?? "(top-level)"}`;
    if (!mod.sections.has(secKey)) mod.sections.set(secKey, []);
    mod.sections.get(secKey)!.push(
      items.find((c) => c.itemId === it.itemId)!,
    );
  }

  const modules = [...byModule.values()].map((m) => ({
    moduleId: m.moduleId,
    moduleTitle: m.moduleTitle,
    sections: [...m.sections.entries()].map(([key, list]) => ({
      sectionId: key.split("|")[0] === "top" ? null : Number(key.split("|")[0]),
      sectionTitle: key.split("|")[1] === "(top-level)" ? null : key.split("|")[1],
      items: list,
    })),
  }));

  return { courseId: course.courseId, courseName: course.courseName, slugDir, items, modules };
}

async function main(): Promise<void> {
  const treePath = resolveOut(config.outDir, "raw", "content-tree.json");
  const parsed = JSON.parse(readFileSync(treePath, "utf-8")) as Course[];
  // Drop synthetic "gradebook-only" rows left by older scrapes (the portal never
  // assigns negative ids) and God's Eye hidden topics, so neither resurfaces in
  // the normal homework index (hidden content lives at the /gods-eye route).
  const courses: Course[] = parsed.map((course) => ({
    ...course,
    items: course.items.filter(
      (it) => it.itemId >= 0 && it.moduleId >= 0 && it.origin !== "hidden",
    ),
  }));

  const coursesIndex = courses.map(buildCourseIndex);

  // homework = undone file_upload (and quizzes) deliverables, enriched with siblings
  const homework: {
    courseId: number;
    courseName: string;
    moduleId: number;
    moduleTitle: string;
    sectionId: number | null;
    sectionTitle: string | null;
    itemId: number;
    itemTitle: string;
    kind: string;
    deadlineAt: string | null;
    daysLeft: number | null;
    expired: boolean;
    files: { name: string; relPath: string }[];
    siblings: { itemId: number; itemTitle: string; kind: string; done: boolean }[];
  }[] = [];

  const HOMEWORK_KINDS = new Set(["file_upload", "quiz"]);

  for (const course of coursesIndex) {
    for (const mod of course.modules) {
      for (const sec of mod.sections) {
        const deliverables = sec.items.filter((i) => HOMEWORK_KINDS.has(i.kind) && !i.done);
        const others = sec.items.filter((i) => !HOMEWORK_KINDS.has(i.kind));
        for (const d of deliverables) {
          homework.push({
            courseId: course.courseId,
            courseName: course.courseName,
            moduleId: mod.moduleId,
            moduleTitle: mod.moduleTitle,
            sectionId: sec.sectionId,
            sectionTitle: sec.sectionTitle,
            itemId: d.itemId,
            itemTitle: d.itemTitle,
            kind: d.kind,
            deadlineAt: d.deadlineAt,
            daysLeft: daysLeft(d.deadlineAt),
            expired: d.expired,
            files: d.localFiles,
            siblings: others.map((o) => ({ itemId: o.itemId, itemTitle: o.itemTitle, kind: o.kind, done: o.done })),
          });
        }
      }
    }
  }

  // primary sort: open-with-deadline (by days asc) → open-no-deadline → expired (by days asc)
  const rank = (h: typeof homework[number]): number =>
    !h.expired && h.daysLeft != null ? 0 : h.expired ? 2 : 1;
  homework.sort((a, b) => rank(a) - rank(b) || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));

  const openWithDeadline = homework.filter((h) => !h.expired && h.daysLeft != null);
  const nextUp = openWithDeadline.length > 0 ? openWithDeadline[0] : null;

  const out = {
    generatedAt: new Date().toISOString(),
    nextUp,
    courses: coursesIndex,
    homework,
    stats: {
      courses: coursesIndex.length,
      items: coursesIndex.reduce((n, c) => n + c.items.length, 0),
      homeworkOpen: homework.filter((h) => !h.expired).length,
      homeworkExpired: homework.filter((h) => h.expired).length,
    },
  };

  const outFile = path.join(resolveOut(config.outDir, "raw"), "homework-index.json");
  ensureDir(path.dirname(outFile));
  // Node fs write:
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outFile, json(out), "utf-8");

  logger.info({ homework: homework.length, nextUp: nextUp?.itemTitle }, "homework index built");
  console.log(`\nIndex → ${outFile}`);
  if (nextUp) {
    console.log(`\n🎯 Next up: ${nextUp.itemTitle} (${nextUp.courseName}) — due in ${nextUp.daysLeft}d`);
  }
  console.log(`Open homework: ${out.stats.homeworkOpen} | expired: ${out.stats.homeworkExpired}`);
}

main().catch((err) => {
  logger.error({ err }, "build-homework-index failed");
  console.error(err);
  process.exit(1);
});

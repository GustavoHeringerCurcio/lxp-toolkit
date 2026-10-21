import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession, type Session } from "../src/session.js";
import { ApiClient } from "../src/client.js";
import {
  collectContent,
  fetchGradebookActivities,
  harvestHiddenTopics,
  parseForumInfo,
  parseQuizQuestions,
  retainedHiddenItems,
  type ContentCourse,
  type ContentItem,
  type HiddenHarvestResult,
} from "../src/content.js";
import { downloadPdf } from "../src/actions.js";
import { config, logger } from "../src/config.js";
import { codeBlock, htmlToMarkdown, tableCell } from "../src/markdown.js";
import { ensureDir, json, resolveOut, sanitizeFilename, slugify } from "../src/util.js";

/**
 * Cookie-aware topic-detail fetcher: goes through the browser context so the
 * `aws-waf-token` cookie is sent, which avoids the WAF throttling that the
 * bearer-only ApiClient trips when sweeping hundreds of hidden-topic ids.
 */
function topicFetcher(session: Session, courseId: number) {
  const headers: Record<string, string> = {
    ...ApiClient.headersFor(session.auth.token, session.auth.notice),
  };
  return async (id: number) => {
    const url = `https://api.plataforma.grupoa.education/v2/plataforma/content/academics-main/${courseId}/topics/${id}`;
    const res = await session.context.request.get(url, { headers, timeout: 20_000 });
    if (res.status() !== 200) throw new Error(`GET topic ${id} -> ${res.status()}`);
    return res.json();
  };
}

/**
 * Topic ids announced in the last calendar dump. Appointments with
 * `entityType:"topic"` carry the real topic id, which lets the hidden sweep
 * find not-yet-published tasks that live far from the current tree ids.
 */
function calendarTopicIds(rawDir: string, courseId: number): number[] {
  const file = path.join(rawDir, "surfaces.json");
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf-8")) as {
      surfaces?: Record<string, unknown>;
    };
    const appointments = data.surfaces?.["calendar-appointments"];
    if (!Array.isArray(appointments)) return [];
    const ids = new Set<number>();
    for (const raw of appointments as Array<Record<string, unknown>>) {
      if (raw.entityType !== "topic") continue;
      const id = Number(raw.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const mains = Array.isArray(raw.academicMain)
        ? (raw.academicMain as Array<Record<string, unknown>>)
        : [];
      if (!mains.some((m) => Number(m.academicMainId) === courseId)) continue;
      ids.add(id);
    }
    return [...ids];
  } catch (err) {
    logger.debug({ err }, "failed to read calendar topic ids");
    return [];
  }
}

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF exercise",
  reading: "Reading",
  quiz: "Quiz",
  file_upload: "Assignment (file upload)",
  link: "Link",
  forum: "Forum",
  other: "Content",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function itemSlug(item: ContentItem): string {
  const title = slugify(item.itemTitle || `item-${item.itemId}`);
  return `${item.itemId}-${title}`;
}

function renderQuizQuestions(item: ContentItem): string[] {
  const questions = parseQuizQuestions(item.content);
  if (questions.length === 0) return [];
  const lines: string[] = [];
  lines.push("## Questions");
  lines.push("");
  for (const q of questions) {
    lines.push(`### Question ${q.id} (questionTypeId=${q.questionTypeId}, grade=${tableCell(q.grade ?? "—")})`);
    lines.push("");
    lines.push(htmlToMarkdown(q.enunciated));
    lines.push("");
    q.options.forEach((opt, i) => {
      lines.push(`- **${String.fromCharCode(97 + i)})** ${htmlToMarkdown(opt.text).replace(/\n+/g, " ")}`);
    });
    lines.push("");
  }
  return lines;
}

function renderUploadDetails(item: ContentItem): string[] {
  if (item.kind !== "file_upload" || !item.content) return [];
  const c = item.content;
  const lines: string[] = [];
  lines.push("## Assignment details");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| hasFileUpload | ${c.hasFileUpload} |`);
  lines.push(`| maxFilesLimit | ${c.maxFilesLimit} |`);
  lines.push(`| isUnlimitedFilesEnabled | ${c.isUnlimitedFilesEnabled} |`);
  lines.push(`| hasRetries | ${c.hasRetries} (numberRetries=${c.numberRetries}, retryTypeId=${c.retryTypeId}) |`);
  lines.push(`| hasCompletedAllAttempts | ${c.hasCompletedAllAttempts} |`);
  lines.push("");
  return lines;
}

function renderLinks(item: ContentItem): string[] {
  if (item.links.length > 0) {
    const lines: string[] = [];
    lines.push("## Links");
    lines.push("");
    for (const l of item.links) {
      lines.push(`- [${l.title || l.url}](${l.url})${l.type ? ` — \`${l.type}\`` : ""}`);
    }
    lines.push("");
    return lines;
  }
  return renderForumDetails(item);
}

function renderForumDetails(item: ContentItem): string[] {
  const info = parseForumInfo(item.content);
  if (item.kind !== "forum" || !info) return [];
  const lines: string[] = [];
  lines.push("## Forum details");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| countPosts | ${info.countPosts} (mine: ${info.countOfMyPosts}) |`);
  lines.push(`| isAllowLikes | ${info.isAllowLikes} |`);
  lines.push(`| isToLimitResponses | ${info.isToLimitResponses} (maxAnswerPerStudent=${info.maxAnswerPerStudent}) |`);
  lines.push(`| isOnlyVisibleToPeopleWithPost | ${info.isOnlyVisibleToPeopleWithPost} |`);
  lines.push(`| hasReachedPostLimit | ${info.hasReachedPostLimit} |`);
  lines.push("");

  const renderPost = (indent: string, p: (typeof info.posts)[number]): void => {
    if (p.isDeleted) return;
    const who = `${p.postOwnerUsername}${p.postOwnerSafeaRole && p.postOwnerSafeaRole !== "student" ? ` (${p.postOwnerRoleName ?? p.postOwnerSafeaRole})` : ""}`;
    lines.push(`### ${indent}Post ${p.id} — ${who} — ${p.createdAt}${p.isEdited ? " (edited)" : ""}`);
    lines.push("");
    lines.push(htmlToMarkdown(p.html));
    lines.push("");
    for (const c of p.children) renderPost(`${indent}↳ `, c);
  };
  for (const p of info.posts) renderPost("", p);
  return lines;
}

function renderItemMarkdown(item: ContentItem): string {
  const lines: string[] = [];
  lines.push(`# ${item.itemTitle}`);
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Item ID | \`${item.itemId}\` |`);
  lines.push(`| Kind | ${kindLabel(item.kind)} (\`topicTypeId=${item.topicTypeId}\`) |`);
  lines.push(`| Course | ${tableCell(item.courseName)} |`);
  lines.push(`| Module | ${tableCell(item.moduleTitle)} |`);
  lines.push(`| Section | ${tableCell(item.sectionTitle ?? "—")} |`);
  lines.push(`| Done | ${item.done ? "yes" : "no"} (viewed=${item.viewed}, grade=${tableCell(item.grade ?? "—")}, studentGrade=${tableCell(item.studentGrade ?? "—")}) |`);
  lines.push(`| Progress | \`progressTypeId=${item.progressTypeId}\`, \`isRecordProgress=${item.isRecordProgress}\` |`);
  lines.push(`| Has deadline | ${item.hasDeadline} |`);
  lines.push(`| Deadline | ${item.deadlineAt ?? "—"} |`);
  lines.push(`| Expired | ${item.expired} |`);
  lines.push(`| Completed all attempts | ${item.hasCompletedAllAttempts ?? "n/a"} |`);
  lines.push("");

  if (item.attachments.length > 0) {
    lines.push("## Attachments");
    lines.push("");
    for (const att of item.attachments) {
      lines.push(`- [${att.filename ?? "download"}](${att.url})${att.filesize ? ` (${att.filesize} bytes)` : ""}`);
    }
    lines.push("");
  }

  lines.push(...renderUploadDetails(item));
  lines.push(...renderQuizQuestions(item));
  lines.push(...renderLinks(item));

  if (item.html) {
    lines.push("## Content");
    lines.push("");
    lines.push(htmlToMarkdown(item.html));
    lines.push("");
  }

  lines.push("## Raw JSON");
  lines.push("");
  lines.push(codeBlock(json({ ...item, html: item.html ? `<omitted ${item.html.length} chars>` : null, content: item.content ? `<omitted ${JSON.stringify(item.content).length} chars>` : null })));
  lines.push("");
  return lines.join("\n");
}

function renderCourseReadme(course: ContentCourse): string {
  const items = course.items.filter((i) => i.origin !== "hidden");
  const lines: string[] = [];
  lines.push(`# ${course.courseName}`);
  lines.push("");
  lines.push(`- **Course ID:** \`${course.courseId}\``);
  lines.push(`- **Total items:** ${items.length}`);
  lines.push("");

  const byKind = new Map<string, { total: number; undone: number }>();
  for (const item of items) {
    const e = byKind.get(item.kind) ?? { total: 0, undone: 0 };
    e.total++;
    if (!item.done) e.undone++;
    byKind.set(item.kind, e);
  }

  lines.push("## Breakdown by kind");
  lines.push("");
  lines.push("| Kind | Total | Undone |");
  lines.push("|---|---|---|");
  for (const [kind, c] of byKind) {
    lines.push(`| ${kindLabel(kind)} | ${c.total} | ${c.undone} |`);
  }
  lines.push("");

  const undone = course.items.filter((i) => !i.done && i.origin !== "hidden");
  if (undone.length > 0) {
    lines.push("## Undone items");
    lines.push("");
    for (const item of undone) {
      lines.push(`- [${item.itemTitle}](./${itemSlug(item)}.md) — ${kindLabel(item.kind)}${item.deadlineAt ? ` (due ${item.deadlineAt})` : ""}`);
    }
    lines.push("");
  }

  lines.push("## All items");
  lines.push("");
  for (const item of items) {
    lines.push(`- [${item.done ? "x" : " "}] [${item.itemTitle}](./${itemSlug(item)}.md) — ${kindLabel(item.kind)}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const courseIds = args
    .filter((a) => /^\d+$/.test(a))
    .map(Number);

  const session = await createSession();
  try {
    const courses = await collectContent(session.client, courseIds);

    const coursesDir = resolveOut(config.outDir, "courses");
    const rawDir = resolveOut(config.outDir, "raw");
    ensureDir(coursesDir);
    ensureDir(rawDir);

    // ── God's Eye: harvest topics the portal serves by id but hides from the
    // content tree. Appended with `origin:"hidden"` so the web app can surface
    // them in a dedicated route without polluting the normal task lists.
    const harvestResults: HiddenHarvestResult[] = [];
    if (process.env.SKIP_HARVEST === "1") {
      logger.warn("SKIP_HARVEST=1 — pulando a varredura de conteúdo oculto.");
    } else {
      const hiddenIndexPath = path.join(rawDir, "hidden-index.json");
      let previousByCourse = new Map<number, ContentItem[]>();
      if (existsSync(hiddenIndexPath)) {
        try {
          const prev = JSON.parse(readFileSync(hiddenIndexPath, "utf-8")) as {
            courses?: HiddenHarvestResult[];
          };
          previousByCourse = new Map(
            (prev.courses ?? []).map((c) => [c.courseId, c.hidden ?? []]),
          );
        } catch (err) {
          logger.warn({ err }, "failed to read previous hidden-index.json");
        }
      }

      for (const course of courses) {
        try {
          const gradebook = await fetchGradebookActivities(session.client, course.courseId);
          const extraIds = [
            ...(course.containerIds ?? []),
            ...calendarTopicIds(rawDir, course.courseId),
          ];
          const result = await harvestHiddenTopics(
            session.client,
            { id: course.courseId, name: course.courseName },
            course.items,
            gradebook,
            {
              previous: previousByCourse.get(course.courseId) ?? [],
              extraIds,
              fetchTopic: topicFetcher(session, course.courseId),
              concurrency: 2,
              delayMs: 120,
              wafAbortThreshold: 40,
              wafCooldownMs: 5_000,
            },
          );
          harvestResults.push(result);
          course.items.push(...result.hidden);
          logger.info(
            {
              course: course.courseName,
              candidates: result.candidates,
              scanned: result.scanned,
              hidden: result.hidden.length,
              errors: result.errors,
              throttled: result.throttled,
            },
            "hidden-topic harvest complete",
          );
        } catch (err) {
          logger.warn({ courseId: course.courseId, err }, "hidden-topic harvest failed");
        }
      }

      // Safety net: a failed (or entirely missing) course must never drop the
      // hidden topics harvested on a previous run. Keep them in both artifacts
      // so a later update still surfaces them and a fresh DB import retains
      // them. Only container phantoms are removed here.
      const currentIds = new Set(courses.map((c) => c.courseId));
      const harvested = new Set(harvestResults.map((r) => r.courseId));
      const failedCourses: { courseId: number; courseName: string; kept: number }[] = [];
      for (const course of courses) {
        if (harvested.has(course.courseId)) continue;
        const previous = previousByCourse.get(course.courseId) ?? [];
        const kept = retainedHiddenItems(
          previous,
          course.items.map((i) => i.itemId),
        );
        if (kept.length > 0) course.items.push(...kept);
        harvestResults.push({
          courseId: course.courseId,
          courseName: course.courseName,
          candidates: 0,
          scanned: 0,
          errors: 0,
          throttled: false,
          hidden: kept,
        });
        failedCourses.push({ courseId: course.courseId, courseName: course.courseName, kept: kept.length });
      }

      const missingCourses: number[] = [];
      for (const [courseId, previous] of previousByCourse) {
        if (currentIds.has(courseId)) continue;
        const kept = retainedHiddenItems(previous);
        missingCourses.push(courseId);
        harvestResults.push({
          courseId,
          courseName: kept[0]?.courseName ?? "",
          candidates: 0,
          scanned: 0,
          errors: 0,
          throttled: false,
          hidden: kept,
        });
      }

      const throttledCourses = harvestResults
        .filter((r) => r.throttled)
        .map((r) => r.courseName || String(r.courseId));
      const partial =
        failedCourses.length > 0 || missingCourses.length > 0 || throttledCourses.length > 0;

      writeFileSync(
        hiddenIndexPath,
        json({
          generatedAt: new Date().toISOString(),
          partial,
          throttled: throttledCourses.length > 0,
          failedCourses,
          missingCourses,
          courses: harvestResults,
        }),
        "utf-8",
      );

      if (partial) {
        const parts = [
          failedCourses.length > 0
            ? `varredura falhou: ${failedCourses.map((f) => f.courseName || f.courseId).join(", ")}`
            : "",
          missingCourses.length > 0 ? `curso não coletado: ${missingCourses.join(", ")}` : "",
          throttledCourses.length > 0 ? `WAF interrompeu: ${throttledCourses.join(", ")}` : "",
        ].filter(Boolean);
        logger.warn(
          { failedCourses, missingCourses, throttledCourses },
          "God's Eye sweep incomplete",
        );
        console.log(`[gods-eye] partial — ${parts.join("; ")}`);
      }
    }

    const totalItems = courses.reduce((n, c) => n + c.items.length, 0);
    let writtenFiles = 0;

    for (const course of courses) {
      const courseDir = path.join(coursesDir, `${course.courseId}-${slugify(course.courseName)}`);
      ensureDir(courseDir);
      const filesDir = path.join(courseDir, "files");
      ensureDir(filesDir);

      for (const item of course.items) {
        // Hidden (God's Eye) topics are not part of the published tree; keep the
        // per-course markdown dump limited to what the portal actually shows.
        if (item.origin === "hidden") continue;
        const file = path.join(courseDir, `${itemSlug(item)}.md`);
        writeFileSync(file, renderItemMarkdown(item), "utf-8");
        writtenFiles++;

        for (const att of item.attachments) {
          const base = att.filename ?? path.basename(new URL(att.url).pathname);
          const uniq = `${item.itemId}__${base}`;
          const saved = await downloadPdf(att.url, uniq, filesDir);
          if (saved) {
            writtenFiles++;
            logger.debug({ file: saved }, "downloaded attachment");
          }
        }
      }

      writeFileSync(path.join(courseDir, "README.md"), renderCourseReadme(course), "utf-8");
      writtenFiles++;
    }

    writeFileSync(path.join(rawDir, "content-tree.json"), json(courses), "utf-8");
    writtenFiles++;

    logger.info({ courses: courses.length, items: totalItems, files: writtenFiles }, "content dump complete");
    console.log(`\nDumped ${courses.length} course(s), ${totalItems} item(s) → ${coursesDir}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "dump failed");
  console.error(err);
  process.exit(1);
});

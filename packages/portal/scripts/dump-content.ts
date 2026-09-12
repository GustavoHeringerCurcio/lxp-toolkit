import { writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession } from "../src/session.js";
import {
  collectContent,
  parseForumInfo,
  parseQuizQuestions,
  type ContentCourse,
  type ContentItem,
} from "../src/content.js";
import { downloadPdf } from "../src/actions.js";
import { config, logger } from "../src/config.js";
import { codeBlock, htmlToMarkdown, tableCell } from "../src/markdown.js";
import { ensureDir, json, resolveOut, sanitizeFilename, slugify } from "../src/util.js";

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
  const lines: string[] = [];
  lines.push(`# ${course.courseName}`);
  lines.push("");
  lines.push(`- **Course ID:** \`${course.courseId}\``);
  lines.push(`- **Total items:** ${course.items.length}`);
  lines.push("");

  const byKind = new Map<string, { total: number; undone: number }>();
  for (const item of course.items) {
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

  const undone = course.items.filter((i) => !i.done);
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
  for (const item of course.items) {
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

    const totalItems = courses.reduce((n, c) => n + c.items.length, 0);
    let writtenFiles = 0;

    for (const course of courses) {
      const courseDir = path.join(coursesDir, `${course.courseId}-${slugify(course.courseName)}`);
      ensureDir(courseDir);
      const filesDir = path.join(courseDir, "files");
      ensureDir(filesDir);

      for (const item of course.items) {
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

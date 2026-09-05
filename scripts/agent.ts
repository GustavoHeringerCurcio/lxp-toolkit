import { createSession, closeSession } from "../src/session.js";
import { collectContent, type ContentItem } from "../src/content.js";
import { markRead } from "../src/actions.js";
import { config, logger } from "../src/config.js";

function usage(): void {
  console.log(`LXP exercise agent

Usage:
  npm run agent                    List actionable items (quizzes, uploads, readings), grouped by course
  npm run agent -- --dry-run       Same, but also preview which readings would be auto-completed
  npm run agent -- --read          Auto-complete undone READING items (marks them read via the progress API)

Note: quiz answering and file-upload submission are not yet implemented —
      their write endpoints must first be reverse-engineered (see docs/gaps.md).
`);
}

function isActionable(item: ContentItem): boolean {
  return item.kind === "quiz" || item.kind === "file_upload" || item.kind === "reading" || item.kind === "pdf";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const dryRun = args.includes("--dry-run");
  const doRead = args.includes("--read");
  const courseIds = args.filter((a) => /^\d+$/.test(a)).map(Number);

  const session = await createSession();
  try {
    const courses = await collectContent(session.client, courseIds);
    const items = courses.flatMap((c) => c.items);

    const readings = items.filter((i) => i.kind === "reading" && !i.done);
    const quizzes = items.filter((i) => i.kind === "quiz" && !i.done);
    const uploads = items.filter((i) => i.kind === "file_upload" && !i.done);

    console.log(`\n=== Exercise agent ===`);
    console.log(`Courses: ${courses.length} | Items: ${items.length}`);
    console.log(`Undone readings: ${readings.length} | Undone quizzes: ${quizzes.length} | Undone uploads: ${uploads.length}\n`);

    if (doRead || dryRun) {
      console.log(`${dryRun ? "[DRY-RUN] " : ""}Readings that would be auto-completed:`);
      let completed = 0;
      for (const item of readings) {
        if (item.expired) continue;
        console.log(`  - ${item.courseName} :: ${item.itemTitle}`);
        if (!dryRun && doRead) {
          const ok = await markRead(session.client, item.courseId, item.itemId);
          if (ok) completed++;
          else logger.warn({ itemId: item.itemId }, "failed to mark read");
        }
      }
      if (!dryRun && doRead) console.log(`\nMarked ${completed} reading item(s) as read.`);
      if (dryRun) console.log(`\n(dry run — no changes made; use --read to execute)`);
    }

    if (!doRead && !dryRun) {
      for (const [label, list] of [
        ["Quizzes", quizzes],
        ["File uploads", uploads],
        ["Readings", readings],
      ] as const) {
        if (list.length === 0) continue;
        console.log(`\n${label}:`);
        for (const item of list) {
          console.log(`  [ ] ${item.courseName} :: ${item.itemTitle}${item.deadlineAt ? ` (due ${item.deadlineAt})` : ""}`);
        }
      }
    }

    if (quizzes.length > 0 || uploads.length > 0) {
      console.log("\nNote: quiz/upload completion requires discovering their write endpoints.");
      console.log("Run `npm run capture-api -- --url <itemUrl> --headful` to reverse-engineer them.");
    }
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "agent failed");
  console.error(err);
  process.exit(1);
});

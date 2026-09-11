import { createSession, closeSession } from "../src/session.js";
import { collectContent, isMarkable } from "../src/content.js";
import { markRead } from "../src/actions.js";
import { logger } from "../src/config.js";

function usage(): void {
  console.log(`LXP exercise agent

Usage:
  npm run agent                    List actionable items (quizzes, uploads, markable content), grouped by course
  npm run agent -- --dry-run       Same, but also preview which items would be auto-completed
  npm run agent -- --read          Auto-complete every pending "Mark as completed" item
  npm run agent -- --complete      Alias for --read

Note: quiz answering and file-upload submission are not yet implemented —
      their write endpoints must first be reverse-engineered (see docs/gaps.md).
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const dryRun = args.includes("--dry-run");
  const doComplete =
    args.includes("--read") || args.includes("--complete") || args.includes("--mark");
  const courseIds = args.filter((a) => /^\d+$/.test(a)).map(Number);

  const session = await createSession();
  try {
    const courses = await collectContent(session.client, courseIds);
    const items = courses.flatMap((c) => c.items);

    const markable = items.filter(isMarkable);
    const quizzes = items.filter((i) => i.kind === "quiz" && !i.done);
    const uploads = items.filter((i) => i.kind === "file_upload" && !i.done);

    console.log(`\n=== Exercise agent ===`);
    console.log(`Courses: ${courses.length} | Items: ${items.length}`);
    console.log(
      `Pending "Mark as completed": ${markable.length} | Undone quizzes: ${quizzes.length} | Undone uploads: ${uploads.length}\n`,
    );

    if (doComplete || dryRun) {
      console.log(`${dryRun ? "[DRY-RUN] " : ""}Items that would be marked as completed:`);
      let completed = 0;
      for (const item of markable) {
        if (item.expired) continue;
        console.log(`  - [${item.kind}] ${item.courseName} :: ${item.itemTitle}`);
        if (!dryRun && doComplete) {
          const ok = await markRead(session.client, item.courseId, item.itemId);
          if (ok) completed++;
          else logger.warn({ itemId: item.itemId }, "failed to mark completed");
        }
      }
      if (!dryRun && doComplete) console.log(`\nMarked ${completed} item(s) as completed.`);
      if (dryRun) console.log(`\n(dry run — no changes made; use --read or --complete to execute)`);
    }

    if (!doComplete && !dryRun) {
      for (const [label, list] of [
        ["Quizzes", quizzes],
        ["File uploads", uploads],
        ['"Mark as completed"', markable],
      ] as const) {
        if (list.length === 0) continue;
        console.log(`\n${label}:`);
        for (const item of list) {
          console.log(
            `  [ ] ${item.courseName} :: ${item.itemTitle}${item.deadlineAt ? ` (due ${item.deadlineAt})` : ""}`,
          );
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

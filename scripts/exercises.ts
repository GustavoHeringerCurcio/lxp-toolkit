import { createSession, closeSession } from "../src/session.js";
import { fetchQuiz, fetchUploadTask } from "../src/exercises.js";
import { htmlToMarkdown } from "../src/markdown.js";
import { logger } from "../src/config.js";

/**
 * Read-only "exercises" explorer: inspect a single content item (quiz questions,
 * upload instructions/limits) straight from the API.
 *
 * Usage:
 *   npm run exercises -- <itemId>            (course 5254272 is inferred)
 *   npm run exercises -- <itemId> <courseId>
 */
function usage(): void {
  console.log(`Exercises explorer (read-only)

Usage:
  npm run exercises -- <itemId>            Inspect one content item
  npm run exercises -- <itemId> <courseId>

Examples:
  npm run exercises -- 89612190            → quiz questions (Eng. Requisitos)
  npm run exercises -- 89612213            → "Casos de Uso" upload info

Note: this only READS. Submitting answers/uploads is intentionally not wired —
see docs/gaps.md.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args.length === 0) return usage();

  const itemId = Number(args[0]);
  const courseId = args.length > 1 ? Number(args[1]) : 5254272;
  if (!Number.isFinite(itemId)) return usage();

  const session = await createSession();
  try {
    // figure out kind + title from the content tree
    const { collectContent } = await import("../src/content.js");
    const courses = await collectContent(session.client, [courseId]);
    const course = courses.find((c) => c.courseId === courseId);
    const item = course?.items.find((i) => i.itemId === itemId);

    if (!item) {
      console.error(`Item ${itemId} not found in course ${courseId}.`);
      return;
    }

    console.log(`\n${item.itemTitle}`);
    console.log(`  kind: ${item.kind} | module: ${item.moduleTitle}${item.sectionTitle ? " | section: " + item.sectionTitle : ""}`);
    if (item.deadlineAt) console.log(`  deadline: ${item.deadlineAt}${item.expired ? " (expired)" : ""}`);

    if (item.kind === "quiz") {
      const questions = await fetchQuiz(session.client, courseId, itemId);
      console.log(`  questions: ${questions.length}\n`);
      for (const q of questions) {
        console.log(`Q${q.id}: ${htmlToMarkdown(q.enunciated)}`);
        q.options.forEach((o, i) => {
          console.log(`   ${String.fromCharCode(97 + i)}) ${htmlToMarkdown(o.text).replace(/\n+/g, " ")}`);
        });
        console.log("");
      }
    } else if (item.kind === "file_upload") {
      const task = await fetchUploadTask(session.client, courseId, itemId);
      console.log(`  maxFilesLimit: ${task?.maxFilesLimit ?? "n/a"} | hasRetries: ${task?.hasRetries}`);
      if (task?.html) console.log(`\n${htmlToMarkdown(String(task.html)).slice(0, 2000)}\n`);
      if (item.attachments.length) {
        console.log("  attachments:");
        for (const a of item.attachments) console.log(`    - ${a.filename ?? a.url}`);
      }
    } else {
      console.log(`  (${item.kind} — not a quiz or upload; no extra exercise data)`);
    }
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "exercises failed");
  console.error(err);
  process.exit(1);
});

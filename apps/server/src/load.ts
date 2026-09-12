import { importAll } from "./import.js";
import { writeProjection } from "./project.js";
import { loadExercises } from "./build.js";
import { closePool } from "./db.js";

/**
 * `npm run index` — the full data pipeline:
 *   migrate → import scraped content into Postgres → project the DB to exercises.json.
 * Postgres is required; there is no JSON fallback.
 */
async function main(): Promise<void> {
  const summary = await importAll();
  console.log(
    `db: imported ${summary.courses} course(s), ${summary.items} item(s), ${summary.professors} professor(s).`,
  );

  const { file, count } = await writeProjection();
  console.log(`Exercises built → ${file} (${count})`);

  const exercises = loadExercises();
  const open = exercises.filter((e) => e.status === "open").length;
  const expired = exercises.filter((e) => e.status === "expired").length;
  const done = exercises.filter((e) => e.status === "done").length;
  const byKind = (k: string) => exercises.filter((e) => e.kind === k).length;
  console.log(
    `  quizzes: ${byKind("quiz")} | uploads: ${byKind("upload")} | marcar: ${byKind("mark")} | fóruns: ${byKind("forum")} | outros: ${byKind("other")}`,
  );
  console.log(`  open: ${open} | expired: ${expired} | done: ${done}`);
}

main()
  .catch((err) => {
    console.error(`index: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());

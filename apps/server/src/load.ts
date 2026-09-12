import { buildExercises, writeExercises } from "./build.js";

const exercises = buildExercises();
const file = writeExercises(exercises);

const open = exercises.filter((e) => e.status === "open").length;
const expired = exercises.filter((e) => e.status === "expired").length;
const done = exercises.filter((e) => e.status === "done").length;
const byKind = (k: string) => exercises.filter((e) => e.kind === k).length;
console.log(`Exercises built → ${file}`);
console.log(
  `  quizzes: ${byKind("quiz")} | uploads: ${byKind("upload")} | marcar: ${byKind("mark")} | fóruns: ${byKind("forum")} | outros: ${byKind("other")}`,
);
console.log(`  open: ${open} | expired: ${expired} | done: ${done}`);

import { buildExercises, writeExercises } from "./build.js";

const exercises = buildExercises();
const file = writeExercises(exercises);

const open = exercises.filter((e) => e.status === "open").length;
const expired = exercises.filter((e) => e.status === "expired").length;
const done = exercises.filter((e) => e.status === "done").length;
console.log(`Exercises built → ${file}`);
console.log(`  uploads: ${exercises.filter((e) => e.kind === "upload").length} | quizzes: ${exercises.filter((e) => e.kind === "quiz").length}`);
console.log(`  open: ${open} | expired: ${expired} | done: ${done}`);

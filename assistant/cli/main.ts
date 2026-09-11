import { loadExercises } from "../src/build.js";
import { loadAiConfig, loadAnswers, loadOverrides, loadProfile, saveOverrides, saveAnswerVersion } from "../src/config.js";
import { enrich, type ExerciseView } from "../src/view.js";
import { compareDeadline } from "../src/view.js";
import { extractPdfText } from "../src/pdf.js";
import { generateAnswer } from "../src/ai.js";
import { exportAnswer } from "../src/export.js";
import { assist } from "../src/paths.js";
import { parseQuizSelections } from "../src/prompt.js";
import { isTTY, color, typeChip, deadlineChip, deadlineLabel, contextLine, icon } from "./render.js";

function usage(): void {
  console.log(`LXP Homework — organize your exercises + AI answers

Commands:
  npm run assistant -- index               rebuild data/exercises.json from the scraped tree
  npm run assistant -- list [--open|--expired|--done|--all|--quizzes|--uploads] [--json]
  npm run assistant -- show <id>
  npm run assistant -- note <id> "your context"
  npm run assistant -- answer <id> [--model gpt-4o-mini]
  npm run assistant -- export <id>
  npm run assistant -- pdf <id>            extract PDF text of an exercise
  npm run assistant -- config              show AI config path/model
  npm run assistant -- send <id>           (placeholder — submit endpoints not captured yet)
`);
}

function sorted(views: ExerciseView[], scope: "open" | "expired" | "done" | "all"): ExerciseView[] {
  return views.filter((v) => !v.hidden).filter((v) => scope === "all" || v.status === scope).sort(compareDeadline);
}

function printList(scope: "open" | "expired" | "done" | "all"): void {
  const views = enrich(loadExercises(), loadAnswers(), loadOverrides());
  const show = sorted(views, scope);
  const grouped = views.filter((v) => !v.hidden);

  const header = color.bold(`🎓 ${[...new Set(grouped.map((g) => g.courseName))].join(" · ")}`);
  console.log(`\n${header}`);
  console.log(
    color.dim(
      `   ${grouped.filter((g) => g.status === "open").length} open · ${grouped.filter((g) => g.status === "expired").length} expired · ${grouped.filter((g) => g.status === "done").length} done`,
    ),
  );

  for (const v of show) {
    console.log(`  ${icon(v)} ${v.title}  [${typeChip(v)}] [${deadlineChip(v)}]`);
    console.log(`      ${contextLine(v)}`);
  }

  if (show.length === 0) {
    console.log(color.dim(`   (no ${scope} items)`));
  }
  console.log("");
}

function showOne(id: number): void {
  const views = enrich(loadExercises(), loadAnswers(), loadOverrides());
  const v = views.find((x) => x.id === id);
  if (!v) {
    console.error(`Exercise ${id} not found. Run \`npm run assistant -- list --all\` to see ids.`);
    process.exit(1);
  }
  const d = deadlineLabel(v);
  console.log(`\n${color.bold(icon(v) + " " + v.title)}`);
  console.log(`  ${typeChip(v)} · ${deadlineChip(v)}${v.deadlineAt ? `  (${v.deadlineAt})` : ""}`);
  console.log(`  ${contextLine(v)}  (id ${v.id})`);
  if (v.notes) console.log(color.dim(`  📝 nota: ${v.notes}`));

  if (v.files.length) {
    console.log(`\n  arquivos locais:`);
    for (const f of v.files) console.log(`    - ${f.name}  (${f.relPath})`);
  }
  if (v.remoteFiles.length) {
    console.log(`\n  arquivos no portal:`);
    for (const r of v.remoteFiles) console.log(`    - ${r.filename ?? r.url}`);
  }
  if (v.instructionsText) {
    console.log(`\n  instruções:`);
    console.log(`    ${v.instructionsText.slice(0, 2000)}`);
  }
  if (v.kind === "quiz" && v.questions.length) {
    console.log(`\n  questões (${v.questions.length}):`);
    for (const q of v.questions) {
      console.log(`    Q${q.id}: ${q.text}`);
      q.options.forEach((o, i) => console.log(`        ${String.fromCharCode(97 + i)}) ${o}`));
    }
  }
  if (v.answer) {
    console.log(`\n  resposta gerada (${color.bold("ai")}):`);
    console.log(`    ${v.answer.slice(0, 3000)}`);
  } else {
    console.log(color.dim(`\n  (sem resposta gerada ainda — use: npm run assistant -- answer ${id})`));
  }
  console.log("");
}

async function answerCmd(id: number, modelOverride?: string): Promise<void> {
  const cfg = { ...loadAiConfig(), ...(modelOverride ? { model: modelOverride } : {}) };
  const views = enrich(loadExercises(), loadAnswers(), loadOverrides());
  const v = views.find((x) => x.id === id);
  if (!v) {
    console.error(`Exercise ${id} not found.`);
    process.exit(1);
  }
  const profile = loadProfile();
  console.log(`\n🤖 Gerando resposta (modelo: ${cfg.model}) para "${v.title}"…\n`);
  const text = await generateAnswer(
    cfg,
    v,
    v.aiRequestJson,
    profile,
    { onDelta: (d) => process.stdout.write(d) },
    v.notes,
  );
  console.log(`\n`);
  const selections = v.kind === "quiz" ? parseQuizSelections(text, v.questions) : [];
  saveAnswerVersion(id, text, "ai", undefined, selections);
  const out = exportAnswer(v, text);
  console.log(color.dim(`saved → ${out.md}`));
}

function noteCmd(id: number, text: string): void {
  const overrides = loadOverrides();
  const entry = { ...(overrides[String(id)] ?? {}) };
  entry.notes = text;
  overrides[String(id)] = entry;
  saveOverrides(overrides);
  console.log(`note saved for ${id}.`);
}

function exportCmd(id: number): void {
  const views = enrich(loadExercises(), loadAnswers(), loadOverrides());
  const v = views.find((x) => x.id === id);
  if (!v || !v.answer) {
    console.error(`No answer for ${id}. Generate one first: npm run assistant -- answer ${id}`);
    process.exit(1);
  }
  const out = exportAnswer(v, v.answer);
  console.log(`exported →\n  ${out.md}\n  ${out.txt}`);
}

async function pdfCmd(id: number): Promise<void> {
  const views = enrich(loadExercises(), loadAnswers(), loadOverrides());
  const v = views.find((x) => x.id === id);
  if (!v || v.files.length === 0) {
    console.error(`No local files for ${id}.`);
    process.exit(1);
  }
  for (const f of v.files) {
    console.log(`\n--- ${f.name} ---`);
    const t = await extractPdfText(f.absPath);
    console.log(t ? t.slice(0, 4000) : "(sem texto extraível)");
  }
}

function configCmd(): void {
  const cfg = loadAiConfig();
  console.log(`AI config → ${assist("config", "ai-config.json")}`);
  console.log(`  model: ${cfg.model} | temperature: ${cfg.temperature} | max_output_tokens: ${cfg.max_output_tokens ?? 2200}`);
  console.log(`style:`);
  console.log(JSON.stringify(cfg.style, null, 2));
  console.log(`activitySections:`);
  console.log(JSON.stringify(cfg.activitySections, null, 2));
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "index": {
      const { buildExercises, writeExercises } = await import("../src/build.js");
      writeExercises(buildExercises());
      console.log("index rebuilt.");
      return;
    }
    case "list": {
      const scopeArg = rest.find((a) => a.startsWith("--"));
      const scope = (scopeArg ? scopeArg.replace("--", "") : "open") as "open" | "expired" | "done" | "all";
      if (rest.includes("--json")) {
        const views = enrich(loadExercises(), loadAnswers(), loadOverrides());
        console.log(JSON.stringify(sorted(views, scope === "all" ? "all" : scope === "open" ? "open" : scope), null, 2));
        return;
      }
      printList(scope);
      return;
    }
    case "show":
      return showOne(Number(rest[0]));
    case "note":
      return noteCmd(Number(rest[0]), rest.slice(1).join(" "));
    case "answer": {
      const modelFlag = rest.indexOf("--model");
      const model = modelFlag >= 0 ? rest[modelFlag + 1] : undefined;
      const id = Number(rest.find((a) => /^\d+$/.test(a)));
      if (!isTTY) console.log("generating…");
      return answerCmd(id, model);
    }
    case "export":
      return exportCmd(Number(rest[0]));
    case "pdf":
      return pdfCmd(Number(rest[0]));
    case "config":
      return configCmd();
    case "send": {
      console.error(
        "Send não está disponível ainda: os endpoints de envio (quiz/upload) não foram capturados.\n" +
          "Veja docs/gaps.md no repositório de estudo. Por enquanto use: export <id> e envie pelo portal.",
      );
      process.exit(1);
    }
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ASSISTANT_DIR, assist } from "./paths.js";
import { loadSubmissions, saveSubmissions } from "./config.js";
import type { QuizSelection, SubmissionEntry } from "./types.js";

/**
 * LXP submission transport: a gated browser-runner in the ROOT study repo
 * (`scripts/submit-task.ts`). The assistant server never holds portal
 * credentials — it writes a request JSON, spawns the runner (which fresh-logs-in
 * via root `.env`), and records the outcome in `assistant/data/submissions.json`.
 */

export interface SendEnv {
  enabled: boolean;
  reason: string;
  rootDir: string | null;
}

export function sendEnv(): SendEnv {
  const rootDir = path.resolve(ASSISTANT_DIR, "..");
  const checks: [string, string][] = [
    [path.join(rootDir, "package.json"), "raiz do repositório não encontrada"],
    [path.join(rootDir, "scripts", "submit-task.ts"), "runner scripts/submit-task.ts não encontrado"],
    [path.join(rootDir, "node_modules", "playwright"), "playwright não instalado na raiz"],
    [path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx"), "tsx não instalado na raiz"],
  ];
  for (const [file, reason] of checks) {
    if (!existsSync(file)) {
      return { enabled: false, reason: `Envio indisponível: ${reason}.`, rootDir };
    }
  }
  return { enabled: true, reason: "", rootDir };
}

function tsxBin(rootDir: string): string {
  return path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
}

/**
 * Writes the request file and spawns the root runner for an upload task.
 * Returns the submission entry immediately (status "running"); the entry is
 * updated when the child process exits.
 */
export function launchUploadSubmit(view: { id: number; courseId: number; title: string }, answerText: string, ext: "md" | "txt"): SubmissionEntry {
  const env = sendEnv();
  if (!env.enabled || !env.rootDir) {
    throw new Error(env.reason || "runner não configurado");
  }

  const at = Date.now();
  const dir = assist("data", "send");
  mkdirSync(dir, { recursive: true });
  const reqFile = path.join(dir, `req-${view.id}-${at}.json`);
  const resFile = path.join(dir, `res-${view.id}-${at}.json`);
  writeFileSync(
    reqFile,
    JSON.stringify({ action: "upload", courseId: view.courseId, itemId: view.id, answer: answerText, ext }, null, 2),
    "utf-8",
  );

  const entry: SubmissionEntry = { exerciseId: view.id, at: new Date().toISOString(), status: "running", detail: "aguardando login no portal…" };
  pushSubmission(entry);

  spawnRunner(env.rootDir, reqFile, resFile, entry);

  return entry;
}

interface QuizQuestion {
  id: number;
  text: string;
  options: string[];
}

/**
 * Writes the request file and spawns the root runner for a quiz task. Each
 * selection is enriched with the question and option text so the runner can
 * locate the right radio/option on the page.
 */
export function launchQuizSubmit(
  view: { id: number; courseId: number; title: string; questions: QuizQuestion[] },
  selections: QuizSelection[],
): SubmissionEntry {
  const env = sendEnv();
  if (!env.enabled || !env.rootDir) {
    throw new Error(env.reason || "runner não configurado");
  }

  const at = Date.now();
  const dir = assist("data", "send");
  mkdirSync(dir, { recursive: true });
  const reqFile = path.join(dir, `req-${view.id}-${at}.json`);
  const resFile = path.join(dir, `res-${view.id}-${at}.json`);

  const byId = new Map(view.questions.map((q) => [q.id, q]));
  const items = selections.map((s) => {
    const q = byId.get(s.questionId);
    return {
      questionId: s.questionId,
      optionIndex: s.optionIndex,
      letter: s.letter,
      questionText: q?.text ?? "",
      optionText: q?.options[s.optionIndex] ?? "",
    };
  });

  writeFileSync(
    reqFile,
    JSON.stringify({ action: "quiz", courseId: view.courseId, itemId: view.id, selections: items }, null, 2),
    "utf-8",
  );

  const entry: SubmissionEntry = { exerciseId: view.id, at: new Date().toISOString(), status: "running", detail: "aguardando login no portal…" };
  pushSubmission(entry);

  spawnRunner(env.rootDir, reqFile, resFile, entry);

  return entry;
}

/** Spawn the root submit runner and mirror its result into the submission entry. */
function spawnRunner(rootDir: string, reqFile: string, resFile: string, entry: SubmissionEntry): void {
  const child = spawn(tsxBin(rootDir), [path.join(rootDir, "scripts", "submit-task.ts"), "--req", reqFile, "--result", resFile], {
    cwd: rootDir,
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
  });

  child.on("error", (err) => {
    entry.status = "failed";
    entry.detail = `não foi possível iniciar o runner: ${err.message}`;
    pushSubmission(entry);
  });

  child.on("close", (code) => {
    if (existsSync(resFile)) {
      try {
        const res = JSON.parse(readFileSync(resFile, "utf-8")) as { ok?: boolean; status?: string; detail?: string };
        entry.status = res.status === "ok" ? "ok" : res.status === "unknown" ? "unknown" : "failed";
        entry.detail = res.detail ?? `runner saiu com código ${code}`;
      } catch {
        entry.status = "failed";
        entry.detail = `runner terminou mas o resultado não pôde ser lido (código ${code})`;
      }
    } else {
      entry.status = "failed";
      entry.detail = `runner terminou com código ${code} sem gerar resultado`;
    }
    pushSubmission(entry);
  });
}

export function lastSubmission(exerciseId: number): SubmissionEntry | null {
  const subs = loadSubmissions();
  const list = subs[String(exerciseId)] ?? [];
  return list.length ? list[list.length - 1] : null;
}

export function submissionsFor(exerciseId: number): SubmissionEntry[] {
  return loadSubmissions()[String(exerciseId)] ?? [];
}

function pushSubmission(entry: SubmissionEntry): void {
  const subs = loadSubmissions();
  const key = String(entry.exerciseId);
  const list = subs[key] ?? [];
  const existing = list.findIndex((s) => s.at === entry.at);
  if (existing >= 0) list[existing] = entry;
  else list.push(entry);
  subs[key] = list;
  saveSubmissions(subs);
}

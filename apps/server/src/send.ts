import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ASSISTANT_DIR, assist } from "./paths.js";
import { spawnCommand } from "./exec.js";
import { appendSubmission, getProfile, getSubmissions, setManualStatus } from "./store.js";
import type { QuizSelection, SendMode, SubmissionEntry } from "./types.js";

export type { SendMode };

/** Workspace root (apps/server/src → ../../..) and the portal package that holds the runner. */
const REPO_ROOT = path.resolve(ASSISTANT_DIR, "..", "..");
const PORTAL_DIR = path.join(REPO_ROOT, "packages", "portal");

/**
 * LXP submission transport: a gated browser-runner in the portal package
 * (`packages/portal/scripts/submit-task.ts`). The assistant server never holds
 * portal credentials — it writes a request JSON, spawns the runner (which
 * fresh-logs-in via the portal `.env`), and records the outcome in Postgres.
 */

export interface SendEnv {
  enabled: boolean;
  reason: string;
  rootDir: string | null;
}

export function sendEnv(): SendEnv {
  const rootDir = PORTAL_DIR;
  const checks: [string, string][] = [
    [path.join(PORTAL_DIR, "package.json"), "pacote do portal não encontrado"],
    [path.join(PORTAL_DIR, "scripts", "submit-task.ts"), "runner scripts/submit-task.ts não encontrado"],
    [path.join(REPO_ROOT, "node_modules", "playwright"), "playwright não instalado"],
    [tsxBin(), "tsx não instalado"],
  ];
  for (const [file, reason] of checks) {
    if (!existsSync(file)) {
      return { enabled: false, reason: `Envio indisponível: ${reason}.`, rootDir };
    }
  }
  return { enabled: true, reason: "", rootDir };
}

function tsxBin(): string {
  return path.join(REPO_ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
}

/** Attachment/title base name for an upload: `<nome>_<título da atividade>`. */
export async function uploadBaseName(view: { title: string }): Promise<string> {
  const profile = await getProfile();
  return [profile.nome, view.title]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join("_");
}

/**
 * Writes the request file and spawns the root runner for an upload task.
 * `mode` selects how the answer is delivered (see `SendMode`); `filePath` is the
 * pre-generated PDF to attach when `mode === "pdf"`. Returns the submission
 * entry immediately (status "running"); the entry is updated when the child
 * process exits.
 */
export async function launchUploadSubmit(
  view: { id: number; courseId: number; title: string },
  answerText: string,
  mode: SendMode = "txt",
  filePath?: string,
): Promise<SubmissionEntry> {
  const env = sendEnv();
  if (!env.enabled || !env.rootDir) {
    throw new Error(env.reason || "runner não configurado");
  }

  const at = Date.now();
  const dir = assist("data", "send");
  mkdirSync(dir, { recursive: true });
  const reqFile = path.join(dir, `req-${view.id}-${at}.json`);
  const resFile = path.join(dir, `res-${view.id}-${at}.json`);
  const filename = await uploadBaseName(view);
  const payload: Record<string, unknown> = {
    action: "upload",
    courseId: view.courseId,
    itemId: view.id,
    answer: answerText,
    mode,
    filename,
  };
  if (mode === "txt") payload.ext = "txt";
  if (mode === "pdf" && filePath) payload.filePath = filePath;
  writeFileSync(reqFile, JSON.stringify(payload, null, 2), "utf-8");

  const entry: SubmissionEntry = {
    exerciseId: view.id,
    at: new Date().toISOString(),
    status: "running",
    detail: "aguardando login no portal…",
    answer: answerText,
    mode,
  };
  await pushSubmission(entry);

  spawnRunner(env.rootDir, reqFile, resFile, entry);

  return entry;
}

interface QuizQuestion {
  id: number;
  text: string;
  options: { id: number; text: string }[];
}

/**
 * Writes the request file and spawns the root runner for a quiz task. Each
 * selection is enriched with the question and option text so the runner can
 * locate the right radio/option on the page.
 */
export async function launchQuizSubmit(
  view: {
    id: number;
    courseId: number;
    title: string;
    enrollmentId: number | null;
    isSurvey: boolean;
    questions: QuizQuestion[];
  },
  selections: QuizSelection[],
): Promise<SubmissionEntry> {
  const env = sendEnv();
  if (!env.enabled || !env.rootDir) {
    throw new Error(env.reason || "runner não configurado");
  }
  if (!view.enrollmentId) {
    throw new Error("enrollmentId ausente: reindexe os exercícios (npm run index) para enviar o quiz.");
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
      optionId: s.optionId || q?.options[s.optionIndex]?.id || 0,
      questionText: q?.text ?? "",
      optionText: q?.options[s.optionIndex]?.text ?? "",
    };
  });

  writeFileSync(
    reqFile,
    JSON.stringify(
      {
        action: "quiz",
        courseId: view.courseId,
        itemId: view.id,
        enrollmentId: view.enrollmentId,
        survey: view.isSurvey === true,
        selections: items,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const entry: SubmissionEntry = {
    exerciseId: view.id,
    at: new Date().toISOString(),
    status: "running",
    detail: "aguardando login no portal…",
    answer: items.map((i) => `Q${i.questionId}: ${i.letter}`).join(", "),
  };
  await pushSubmission(entry);

  spawnRunner(env.rootDir, reqFile, resFile, entry);

  return entry;
}

/**
 * Writes the request file and spawns the root runner to publish a forum reply.
 * The runner fresh-logins, posts through the enrollment-scoped endpoint and
 * verifies against the thread; falls back to the SPA composer when rejected.
 */
export async function launchForumSubmit(
  view: { id: number; courseId: number; title: string; enrollmentId: number | null },
  answerText: string,
): Promise<SubmissionEntry> {
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
    JSON.stringify(
      {
        action: "forum",
        courseId: view.courseId,
        itemId: view.id,
        enrollmentId: view.enrollmentId ?? undefined,
        answer: answerText,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const entry: SubmissionEntry = {
    exerciseId: view.id,
    at: new Date().toISOString(),
    status: "running",
    detail: "aguardando login no portal…",
    answer: answerText,
    mode: "text",
  };
  await pushSubmission(entry);

  spawnRunner(env.rootDir, reqFile, resFile, entry);

  return entry;
}

/**
 * Writes the request file and spawns the root runner to "mark as completed" a
 * recordable content item (reading/pdf/link/other). The runner fresh-logins and
 * POSTs the progress endpoint; no answer is involved.
 */
export async function launchMarkComplete(view: {
  id: number;
  courseId: number;
  title: string;
}): Promise<SubmissionEntry> {
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
    JSON.stringify({ action: "mark", courseId: view.courseId, itemId: view.id }, null, 2),
    "utf-8",
  );

  const entry: SubmissionEntry = {
    exerciseId: view.id,
    at: new Date().toISOString(),
    status: "running",
    detail: "aguardando login no portal…",
  };
  await pushSubmission(entry);

  spawnRunner(env.rootDir, reqFile, resFile, entry);

  return entry;
}

/** Spawn the portal submit runner and mirror its result into the submission entry. */
function spawnRunner(rootDir: string, reqFile: string, resFile: string, entry: SubmissionEntry): void {
  const child = spawnCommand(tsxBin(), [path.join(rootDir, "scripts", "submit-task.ts"), "--req", reqFile, "--result", resFile], {
    cwd: rootDir,
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
  });

  child.on("error", (err) => {
    entry.status = "failed";
    entry.detail = `não foi possível iniciar o runner: ${err.message}`;
    void pushSubmission(entry);
  });

  child.on("close", (code) => {
    let status: SubmissionEntry["status"] = "failed";
    if (existsSync(resFile)) {
      try {
        const res = JSON.parse(readFileSync(resFile, "utf-8")) as {
          ok?: boolean;
          status?: string;
          detail?: string;
          attachmentName?: string;
          portalDetail?: string;
        };
        status =
          res.status === "ok"
            ? "ok"
            : res.status === "already"
              ? "already"
              : res.status === "unknown"
                ? "unknown"
                : "failed";
        entry.detail = res.detail ?? `runner saiu com código ${code}`;
        if (res.attachmentName) entry.attachmentName = res.attachmentName;
        if (res.portalDetail) entry.portalDetail = res.portalDetail;
        if (status === "ok") entry.confirmationAt = new Date().toISOString();
      } catch {
        entry.detail = `runner terminou mas o resultado não pôde ser lido (código ${code})`;
      }
    } else {
      entry.detail = `runner terminou com código ${code} sem gerar resultado`;
    }
    entry.status = status;
    if (status === "ok" || status === "already") void markDone(entry.exerciseId);
    void pushSubmission(entry);
  });
}

/** Persist "done" for an exercise so the UI keeps showing it as completed. */
async function markDone(exerciseId: number): Promise<void> {
  try {
    await setManualStatus(exerciseId, "done");
  } catch {
    /* ignore */
  }
}

export async function lastSubmission(exerciseId: number): Promise<SubmissionEntry | null> {
  const subs = await getSubmissions();
  const list = subs[String(exerciseId)] ?? [];
  return list.length ? list[list.length - 1] : null;
}

export async function submissionsFor(exerciseId: number): Promise<SubmissionEntry[]> {
  return (await getSubmissions())[String(exerciseId)] ?? [];
}

async function pushSubmission(entry: SubmissionEntry): Promise<void> {
  try {
    await appendSubmission(entry);
  } catch (err) {
    console.error("[send] failed to persist submission:", err instanceof Error ? err.message : err);
  }
}

import type { ChildProcess, SpawnOptions } from "node:child_process";
import { spawnCommand } from "./exec.js";

/**
 * Progress of the "Atualizar" flow: scrape fresh portal content, then rebuild
 * the assistant's list. Shared shape with the web app's `RefreshStatus` DTO.
 */
export interface RefreshState {
  running: boolean;
  step: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  log: string;
}

export interface RefreshConfig {
  /** Repo root — where `npm run dump` runs. */
  repoRoot: string;
  /** apps/server — where `npm run index` runs. */
  assistantDir: string;
  npm?: string;
  /** Injectable for tests; defaults to the real `spawnCommand`. */
  spawn?: (command: string, args: string[], options?: SpawnOptions) => ChildProcess;
  env?: NodeJS.ProcessEnv;
}

export interface RefreshController {
  /** Kick off a run. Returns `false` when one is already in progress. */
  start(): boolean;
  /** Live state (mutated in place; safe to serialize). */
  status(): RefreshState;
  /** Awaitable run, used by tests. */
  run(): Promise<void>;
}

const defaultNpm = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Owns the scrape→index pipeline. Kept separate from the HTTP server so the
 * orchestration (step order, reCAPTCHA retry, error mapping) is unit-testable
 * with an injected `spawn`.
 */
export function createRefreshController(config: RefreshConfig): RefreshController {
  const npm = config.npm ?? defaultNpm;
  const spawn = config.spawn ?? spawnCommand;
  const baseEnv = config.env ?? process.env;

  const state: RefreshState = {
    running: false,
    step: "",
    error: null,
    startedAt: null,
    finishedAt: null,
    log: "",
  };

  function appendLog(chunk: string): void {
    state.log = (state.log + chunk).slice(-8000);
  }

  /** Run one pipeline step, capturing its output into the shared refresh state. */
  function runStep(
    args: string[],
    cwd: string,
    label: string,
    extraEnv: NodeJS.ProcessEnv = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      state.step = label;
      appendLog(`\n$ npm ${args.join(" ")}\n`);
      const child = spawn(npm, args, { cwd, env: { ...baseEnv, ...extraEnv } });
      child.stdout?.on("data", (d: Buffer) => appendLog(d.toString()));
      child.stderr?.on("data", (d: Buffer) => appendLog(d.toString()));
      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${label}: o comando saiu com código ${code}`));
      });
    });
  }

  /** Turn a raw refresh failure into an actionable pt-BR message. */
  function friendlyError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (/reCAPTCHA/i.test(state.log) || /reCAPTCHA/i.test(msg)) {
      return "O portal pediu reCAPTCHA. Rode `HEADFUL=true npm run dump` no terminal e resolva no navegador.";
    }
    if (/no credentials|LXP_USERNAME|LXP_PASSWORD/i.test(msg) || /no credentials/i.test(state.log)) {
      return "Credenciais do portal ausentes. Rode `npm run setup` (ou preencha packages/portal/.env).";
    }
    return msg;
  }

  async function run(): Promise<void> {
    if (state.running) return;
    state.running = true;
    state.step = "Iniciando…";
    state.error = null;
    state.log = "";
    state.startedAt = new Date().toISOString();
    state.finishedAt = null;
    let headfulRetryUsed = false;
    try {
      await runStep(["run", "dump"], config.repoRoot, "Buscando conteúdo novo no portal");
      await runStep(["run", "index"], config.assistantDir, "Montando a lista de atividades");
      state.step = "Concluído";
    } catch (err) {
      // If the portal demanded a reCAPTCHA, retry the scrape once headful so the
      // user can solve it in the browser window (the run auto-continues).
      if (!headfulRetryUsed && /reCAPTCHA/i.test(state.log)) {
        headfulRetryUsed = true;
        appendLog("\nreCAPTCHA detectado — abrindo o navegador para você resolver…\n");
        try {
          await runStep(["run", "dump"], config.repoRoot, "Aguardando você resolver o reCAPTCHA", {
            HEADFUL: "true",
          });
          await runStep(["run", "index"], config.assistantDir, "Montando a lista de atividades");
          state.step = "Concluído";
        } catch (err2) {
          state.error = friendlyError(err2);
          state.step = "Falhou";
        }
      } else {
        state.error = friendlyError(err);
        state.step = "Falhou";
      }
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
  }

  return {
    start(): boolean {
      if (state.running) return false;
      void run();
      return true;
    },
    status(): RefreshState {
      return state;
    },
    run,
  };
}

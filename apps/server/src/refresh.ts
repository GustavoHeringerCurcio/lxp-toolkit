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
  /** Non-fatal problem (e.g. a partial God's Eye sweep) to show as a warning. */
  warning: string | null;
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
  /**
   * Called once per finished run (success or failure) with a snapshot of the
   * final state. The server uses it to persist `refresh_run` rows.
   */
  onFinish?: (state: RefreshState, source: RefreshSource) => void | Promise<void>;
  /**
   * Retry headful when the portal demands a reCAPTCHA. Defaults to `true`
   * (useful on a desktop); the container sets it to `false` because there is
   * no display to show the browser window.
   */
  headfulRetry?: boolean;
}

/** Who triggered a run. Persisted with the `refresh_run` history row. */
export type RefreshSource = "manual" | "scheduled" | "boot";

/**
 * Whether the headful reCAPTCHA retry is enabled for a raw env value.
 * Defaults to enabled; `0`, `false`, `no` and `off` disable it.
 */
export function headfulRetryEnabled(value: string | undefined): boolean {
  return !/^(0|false|no|off)$/i.test(value?.trim() ?? "");
}

export interface RefreshController {
  /** Kick off a run. Returns `false` when one is already in progress. */
  start(source?: RefreshSource): boolean;
  /** Live state (mutated in place; safe to serialize). */
  status(): RefreshState;
  /** Awaitable run, used by tests. */
  run(source?: RefreshSource): Promise<void>;
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
    warning: null,
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

  /** A partial God's Eye sweep is reported by `dump` on stdout. */
  function partialWarning(): string | null {
    const match = state.log.match(/\[gods-eye\] partial[^\n]*/);
    if (!match) return null;
    const detail = match[0]
      .replace(/^\[gods-eye\]\s*partial\s*[—-]?\s*/i, "")
      .trim();
    return detail
      ? `A varredura do Olho de Deus foi parcial (${detail}). Rode a atualização novamente para completar.`
      : "A varredura do Olho de Deus foi parcial. Rode a atualização novamente para completar.";
  }

  async function run(source: RefreshSource = "manual"): Promise<void> {
    if (state.running) return;
    state.running = true;
    state.step = "Iniciando…";
    state.error = null;
    state.warning = null;
    state.log = "";
    state.startedAt = new Date().toISOString();
    state.finishedAt = null;
    // The full scrape: portal content + the other surfaces (grades, calendar,
    // notices, messages, achievements, LTI), then the two local indexes.
    // Fail fast on DB/config problems before spending minutes scraping: the
    // index step would otherwise hit them only after the whole dump.
    const preflightSteps: [string[], string][] = [
      [["run", "db:migrate"], "Verificando o banco de dados"],
    ];
    const scrapeSteps: [string[], string][] = [
      [["run", "dump"], "Buscando conteúdo novo no portal"],
      [["run", "dump-surfaces"], "Buscando notas, calendário e avisos"],
    ];
    const indexSteps: [string[], string][] = [
      [["run", "index"], "Montando o índice de tarefas do portal"],
      [["run", "index:web"], "Montando a lista de atividades"],
    ];
    const runScrape = async (extraEnv: NodeJS.ProcessEnv = {}): Promise<void> => {
      for (const [args, label] of scrapeSteps) {
        await runStep(args, config.repoRoot, label, extraEnv);
      }
    };
    const runPreflight = async (): Promise<void> => {
      for (const [args, label] of preflightSteps) {
        await runStep(args, config.repoRoot, label);
      }
    };
    const runIndexes = async (): Promise<void> => {
      for (const [args, label] of indexSteps) {
        await runStep(args, config.repoRoot, label);
      }
    };
    let headfulRetryUsed = false;
    try {
      await runPreflight();
      await runScrape();
      await runIndexes();
      state.warning = partialWarning();
      state.step = "Concluído";
    } catch (err) {
      // If the portal demanded a reCAPTCHA, retry the scrape once headful so the
      // user can solve it in the browser window (the run auto-continues).
      if (config.headfulRetry !== false && !headfulRetryUsed && /reCAPTCHA/i.test(state.log)) {
        headfulRetryUsed = true;
        appendLog("\nreCAPTCHA detectado — abrindo o navegador para você resolver…\n");
        try {
          await runScrape({ HEADFUL: "true" });
          await runIndexes();
          state.warning = partialWarning();
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
      state.finishedAt = new Date().toISOString();
      // Persist before clearing `running`, so a scheduler tick cannot observe
      // an unrecorded run and start a duplicate in the few milliseconds the
      // DB write takes.
      if (config.onFinish) {
        try {
          await config.onFinish({ ...state, running: false }, source);
        } catch (err) {
          console.error(
            `[refresh] onFinish: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      state.running = false;
    }
  }

  return {
    start(source: RefreshSource = "manual"): boolean {
      if (state.running) return false;
      void run(source);
      return true;
    },
    status(): RefreshState {
      return state;
    },
    run,
  };
}

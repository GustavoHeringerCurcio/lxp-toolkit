import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { killProcessTree, spawnCommand } from "./exec.js";

/**
 * Progress of the "Atualizar" flow: scrape fresh portal content, then rebuild
 * the assistant's list. Shared shape with the web app's `RefreshStatus` DTO.
 */
export interface RefreshChanges {
  newCourses: number;
  newModules: number;
  newItems: number;
}

export interface RefreshState {
  running: boolean;
  step: string;
  error: string | null;
  /** Non-fatal problem (e.g. a partial God's Eye sweep) to show as a warning. */
  warning: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  log: string;
  /** Catalog diff from the last import (new subjects/activities). */
  changes: RefreshChanges | null;
}

export interface RefreshConfig {
  /** Repo root — where `npm run dump` runs. */
  repoRoot: string;
  /** apps/server — where `npm run index` runs. */
  assistantDir: string;
  /** Scraped data root (defaults to DATA_DIR/OUT_DIR/repoRoot/scraped). */
  dataDir?: string;
  npm?: string;
  /** Injectable for tests; defaults to the real `spawnCommand`. */
  spawn?: (command: string, args: string[], options?: SpawnOptions) => ChildProcess;
  env?: NodeJS.ProcessEnv;
  /**
   * Called once per finished run (success or failure) with a snapshot of the
   * final state. The server uses it to persist `refresh_run` rows.
   */
  /** Called once when a run starts, before the first pipeline step. */
  onStart?: (source: RefreshSource, startedAt: string) => void | Promise<void>;
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
    changes: null,
  };

  function appendLog(chunk: string): void {
    state.log = (state.log + chunk).slice(-8000);
  }

  const STEP_TIMEOUT_ENV: Record<string, [string, number]> = {
    dump: ["REFRESH_TIMEOUT_DUMP_MINUTES", 45],
    "dump-surfaces": ["REFRESH_TIMEOUT_SURFACES_MINUTES", 15],
    index: ["REFRESH_TIMEOUT_INDEX_MINUTES", 5],
    "index:web": ["REFRESH_TIMEOUT_PROJECT_MINUTES", 15],
    "db:migrate": ["REFRESH_TIMEOUT_MIGRATE_MINUTES", 5],
  };

  function stepTimeoutMs(args: string[]): number {
    const key = args[1] ?? "";
    const [envKey, fallback] = STEP_TIMEOUT_ENV[key] ?? ["", 30];
    const raw = envKey ? baseEnv[envKey]?.trim() : "";
    const minutes = raw ? Number(raw) : fallback;
    const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : fallback;
    return safe * 60_000;
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
      let settled = false;
      const timeoutMs = stepTimeoutMs(args);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        killProcessTree(child);
        appendLog(`\n${label}: tempo limite de ${Math.round(timeoutMs / 60_000)} min excedido; processo encerrado.\n`);
        reject(new Error(`${label}: tempo limite excedido`));
      }, timeoutMs);
      timer.unref?.();
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      child.stdout?.on("data", (d: Buffer) => appendLog(d.toString()));
      child.stderr?.on("data", (d: Buffer) => appendLog(d.toString()));
      child.on("error", (err) => finish(() => reject(err)));
      child.on("close", (code) => {
        finish(() => {
          if (code === 0) resolve();
          else reject(new Error(`${label}: o comando saiu com código ${code}`));
        });
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

  function scrapedDir(): string {
    if (config.dataDir) return path.resolve(config.dataDir);
    const configured = baseEnv.DATA_DIR?.trim() || baseEnv.OUT_DIR?.trim();
    return configured ? path.resolve(config.repoRoot, configured) : path.join(config.repoRoot, "scraped");
  }

  function readJson<T>(file: string): T | null {
    try {
      if (!existsSync(file)) return null;
      return JSON.parse(readFileSync(file, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  /**
   * Read the run summaries written by the scraper + the catalog diff written by
   * the importer. A partial course/surface is a warning, not a failed run (the
   * previous data is kept), and the diff powers the "new subject/activity" toast.
   */
  function applyOutcome(): void {
    const warnings: string[] = [];
    const godsEye = partialWarning();
    if (godsEye) warnings.push(godsEye);

    const contentRun = readJson<{
      complete?: boolean;
      keptCourses?: number[];
      partialCourses?: { courseName?: string; detailsFailed?: number }[];
    }>(path.join(scrapedDir(), "raw", "content-run.json"));
    if (contentRun && contentRun.complete === false) {
      const kept = contentRun.keptCourses?.length ?? 0;
      const partial = contentRun.partialCourses?.length ?? 0;
      warnings.push(
        `A coleta de conteúdo foi parcial (${kept} curso(s) mantido(s) do scrape anterior, ${partial} com falhas de detalhe).`,
      );
    }

    const surfacesRun = readJson<{ complete?: boolean; failed?: string[] }>(
      path.join(scrapedDir(), "raw", "surfaces-run.json"),
    );
    if (surfacesRun && surfacesRun.complete === false) {
      warnings.push(
        `Algumas superfícies não foram atualizadas (${(surfacesRun.failed ?? []).join(", ")}); mantidos os dados anteriores.`,
      );
    }

    const catalog = readJson<{
      newCourses?: unknown[];
      newModules?: unknown[];
      newItems?: unknown[];
    }>(path.join(config.assistantDir, "data", "logs", "catalog", "last-import.json"));
    state.changes = {
      newCourses: catalog?.newCourses?.length ?? 0,
      newModules: catalog?.newModules?.length ?? 0,
      newItems: catalog?.newItems?.length ?? 0,
    };

    state.warning = warnings.length ? warnings.join(" ") : null;
  }

  async function run(source: RefreshSource = "manual"): Promise<void> {
    if (state.running) return;
    state.running = true;
    state.step = "Iniciando…";
    state.error = null;
    state.warning = null;
    state.log = "";
    state.changes = null;
    const startedAt = new Date().toISOString();
    state.startedAt = startedAt;
    state.finishedAt = null;
    if (config.onStart) {
      try {
        await config.onStart(source, startedAt);
      } catch (err) {
        console.error(
          `[refresh] onStart: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
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
      applyOutcome();
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
          applyOutcome();
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

  function maxRunMs(): number {
    const raw = baseEnv.REFRESH_MAX_RUN_MINUTES?.trim();
    const minutes = raw ? Number(raw) : 150;
    return (Number.isFinite(minutes) && minutes > 0 ? minutes : 150) * 60_000;
  }

  return {
    start(source: RefreshSource = "manual"): boolean {
      if (state.running) {
        const started = state.startedAt ? new Date(state.startedAt).getTime() : NaN;
        if (Number.isFinite(started) && Date.now() - started > maxRunMs()) {
          appendLog(
            `\n[refresh] execução anterior expirou após ${Math.round(maxRunMs() / 60_000)} min; liberando o controlador.\n`,
          );
          state.running = false;
          state.step = "Falhou";
          state.error = "A atualização anterior excedeu o tempo limite e foi interrompida.";
          state.finishedAt = new Date().toISOString();
          if (config.onFinish) {
            void Promise.resolve(config.onFinish({ ...state }, "scheduled")).catch((err) => {
              console.warn(
                `[refresh] onFinish (stale): ${err instanceof Error ? err.message : String(err)}`,
              );
            });
          }
        } else {
          return false;
        }
      }
      void run(source);
      return true;
    },
    status(): RefreshState {
      return state;
    },
    run,
  };
}

/**
 * Human/AI-readable refresh logs.
 *
 * Layout (under apps/server/data/logs/refresh/, persisted by the data volume):
 *   status.json                  latest scheduler/run snapshot
 *   runs/<local-time>_<source>.json   one file per refresh run
 *   scheduler/YYYY-MM-DD.json    app starts + scheduler decisions (one per day)
 *
 * Postgres `refresh_run` remains the scheduler's source of truth. These files
 * are the easy-to-read mirror for a person or an agent: first read status.json,
 * then the latest run file.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic.js";
import { assist } from "./paths.js";
import { localParts } from "./refresh-scheduler.js";
import type { RefreshSource } from "./refresh.js";

const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const STATUS_FILE = "status.json";
const LOG_VERSION = 1;
const LOG_RETENTION_DAYS = 90;
/** The refresh controller keeps the last 8000 chars of child output. */
const LOG_EXCERPT_LIMIT = 8000;

export interface RefreshLogConfig {
  enabled: boolean;
  slots: string[];
  timezone: string;
  quietHours: { start: string; end: string } | null;
}

export type RefreshLogStatus = "running" | "ok" | "failed";

export interface RefreshRunSummary {
  file: string;
  source: RefreshSource;
  status: RefreshLogStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  warning: string | null;
}

export interface RefreshRunLog extends RefreshRunSummary {
  version: number;
  timezone: string;
  localStartedAt: string;
  localFinishedAt: string | null;
  step: string;
  logExcerpt: string;
  logTruncated: boolean;
}

export interface RefreshStatusLog {
  updatedAt: string;
  timezone: string;
  autoRefresh: boolean;
  slots: string[];
  quietHours: { start: string; end: string } | null;
  lastRun: RefreshRunSummary | null;
  lastSuccessAt: string | null;
  lastDecision: string | null;
}

export interface RefreshSchedulerEvent {
  at: string;
  type: "app-start" | "scheduler";
  decision?: string;
  autoRefresh?: boolean;
  slots?: string[];
  timezone?: string;
  quietHours?: { start: string; end: string } | null;
}

export interface RefreshSchedulerLog {
  date: string;
  timezone: string;
  events: RefreshSchedulerEvent[];
}

/** Directory that holds the JSON logs (overridable for tests/ops). */
export function refreshLogDir(): string {
  const override = process.env.REFRESH_LOG_DIR?.trim();
  return override ? path.resolve(override) : assist("data", "logs", "refresh");
}

function runsDir(): string {
  return path.join(refreshLogDir(), "runs");
}

function schedulerDir(): string {
  return path.join(refreshLogDir(), "scheduler");
}

function statusFile(): string {
  return path.join(refreshLogDir(), STATUS_FILE);
}

function ensureDirs(): void {
  mkdirSync(runsDir(), { recursive: true });
  mkdirSync(schedulerDir(), { recursive: true });
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(data, null, 2));
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function configFields(config: RefreshLogConfig): Pick<
  RefreshStatusLog,
  "autoRefresh" | "slots" | "timezone" | "quietHours"
> {
  return {
    autoRefresh: config.enabled,
    slots: config.slots,
    timezone: config.timezone || DEFAULT_TIMEZONE,
    quietHours: config.quietHours,
  };
}

function localStamp(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const parts = localParts(date, timezone);
  const hour = String(Math.floor(parts.minutes / 60)).padStart(2, "0");
  const minute = String(parts.minutes % 60).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${parts.dateKey}_${hour}-${minute}-${second}-${millis}`;
}

function localReadable(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return iso;
  }
}

function dateKeyFor(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return localParts(date, timezone).dateKey;
}

/** Run log filename, derived from the start time so start/finish correlate. */
export function refreshRunFileName(
  source: RefreshSource,
  startedAt: string,
  timezone: string,
): string {
  return `${localStamp(startedAt, timezone || DEFAULT_TIMEZONE)}_${source}.json`;
}

function isRunFile(name: string): boolean {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}_(manual|scheduled|boot)\.json$/.test(
    name,
  );
}

function summary(log: RefreshRunLog): RefreshRunSummary {
  return {
    file: log.file,
    source: log.source,
    status: log.status,
    startedAt: log.startedAt,
    finishedAt: log.finishedAt,
    durationMs: log.durationMs,
    error: log.error,
    warning: log.warning,
  };
}

export function redactLog(text: string): string {
  if (!text) return "";
  return text
    .replace(
      /((?:LXP_PASSWORD|LXP_USERNAME|OPENAI_API_KEY|TOOLKIT_TOKEN|DATABASE_URL)\s*[=:]\s*)([^\s"']+)/gi,
      "$1[redacted]",
    )
    .replace(/(authorization:\s*bearer\s+)([^\s]+)/gi, "$1[redacted]")
    .replace(/(cookie:\s*)([^\n]+)/gi, "$1[redacted]")
    .replace(/("(?:password|token|secret|api_?key)"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2")
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[redacted]");
}

export function readRefreshStatus(): RefreshStatusLog | null {
  return readJson<RefreshStatusLog>(statusFile());
}

function writeStatus(
  patch: Partial<RefreshStatusLog>,
  config?: RefreshLogConfig,
): RefreshStatusLog {
  const current = readRefreshStatus();
  const next: RefreshStatusLog = {
    updatedAt: new Date().toISOString(),
    timezone: config?.timezone || current?.timezone || DEFAULT_TIMEZONE,
    autoRefresh: config ? config.enabled : current?.autoRefresh ?? false,
    slots: config ? config.slots : current?.slots ?? [],
    quietHours: config ? config.quietHours : current?.quietHours ?? null,
    lastRun: current?.lastRun ?? null,
    lastSuccessAt: current?.lastSuccessAt ?? null,
    lastDecision: current?.lastDecision ?? null,
    ...patch,
  };
  writeJson(statusFile(), next);
  return next;
}

function appendSchedulerEvent(date: string, event: RefreshSchedulerEvent): void {
  ensureDirs();
  const file = path.join(schedulerDir(), `${date}.json`);
  const current = readJson<RefreshSchedulerLog>(file);
  const next: RefreshSchedulerLog = {
    date,
    timezone: event.timezone || current?.timezone || DEFAULT_TIMEZONE,
    events: [...(current?.events ?? []), event],
  };
  writeJson(file, next);
}

/** One-time boot setup: create dirs, record app-start, publish status.json. */
export async function initRefreshLog(input: {
  config: RefreshLogConfig;
  lastSuccessAt: string | null;
  at?: string;
}): Promise<RefreshStatusLog> {
  ensureDirs();
  const at = input.at ?? new Date().toISOString();
  const timezone = input.config.timezone || DEFAULT_TIMEZONE;
  const config = configFields(input.config);
  appendSchedulerEvent(dateKeyFor(at, timezone), {
    at,
    type: "app-start",
    ...config,
  });
  const status = writeStatus(
    {
      lastSuccessAt: input.lastSuccessAt ?? readRefreshStatus()?.lastSuccessAt ?? null,
      lastRun: listRefreshRuns(1)[0] ?? readRefreshStatus()?.lastRun ?? null,
    },
    input.config,
  );
  pruneRefreshLogs(LOG_RETENTION_DAYS);
  return status;
}

/** Create the per-run file as soon as the scrape starts. */
export async function recordRunStart(input: {
  source: RefreshSource;
  startedAt: string;
  config: RefreshLogConfig;
}): Promise<RefreshRunLog> {
  ensureDirs();
  const timezone = input.config.timezone || DEFAULT_TIMEZONE;
  const file = refreshRunFileName(input.source, input.startedAt, timezone);
  const log: RefreshRunLog = {
    version: LOG_VERSION,
    file,
    source: input.source,
    status: "running",
    timezone,
    startedAt: input.startedAt,
    finishedAt: null,
    durationMs: null,
    localStartedAt: localReadable(input.startedAt, timezone),
    localFinishedAt: null,
    step: "Iniciando…",
    error: null,
    warning: null,
    logExcerpt: "",
    logTruncated: false,
  };
  writeJson(path.join(runsDir(), file), log);
  writeStatus({ lastRun: summary(log) }, input.config);
  return log;
}

/** Complete the per-run file and refresh status.json. */
export async function recordRunFinish(input: {
  source: RefreshSource;
  startedAt: string;
  finishedAt: string;
  status: Exclude<RefreshLogStatus, "running">;
  step: string;
  error: string | null;
  warning: string | null;
  log: string;
  config: RefreshLogConfig;
}): Promise<RefreshRunLog> {
  ensureDirs();
  const timezone = input.config.timezone || DEFAULT_TIMEZONE;
  const file = refreshRunFileName(input.source, input.startedAt, timezone);
  const existing = readJson<RefreshRunLog>(path.join(runsDir(), file));
  const startedMs = new Date(input.startedAt).getTime();
  const finishedMs = new Date(input.finishedAt).getTime();
  const durationMs =
    Number.isFinite(startedMs) && Number.isFinite(finishedMs)
      ? Math.max(0, finishedMs - startedMs)
      : null;
  const log: RefreshRunLog = {
    version: LOG_VERSION,
    file,
    source: input.source,
    status: input.status,
    timezone,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs,
    localStartedAt: existing?.localStartedAt ?? localReadable(input.startedAt, timezone),
    localFinishedAt: localReadable(input.finishedAt, timezone),
    step: input.step,
    error: input.error,
    warning: input.warning,
    logExcerpt: redactLog(input.log),
    logTruncated: input.log.length >= LOG_EXCERPT_LIMIT,
  };
  writeJson(path.join(runsDir(), file), log);
  writeStatus(
    {
      lastRun: summary(log),
      lastSuccessAt:
        input.status === "ok"
          ? input.finishedAt
          : readRefreshStatus()?.lastSuccessAt ?? null,
    },
    input.config,
  );
  return log;
}

/** Append a scheduler decision to the daily file and update status.json. */
export async function recordSchedulerDecision(input: {
  at: string;
  decision: string;
  config: RefreshLogConfig;
}): Promise<void> {
  ensureDirs();
  const timezone = input.config.timezone || DEFAULT_TIMEZONE;
  appendSchedulerEvent(dateKeyFor(input.at, timezone), {
    at: input.at,
    type: "scheduler",
    decision: input.decision,
    ...configFields(input.config),
  });
  writeStatus({ lastDecision: input.decision }, input.config);
}

export function listRefreshRuns(limit = 30): RefreshRunSummary[] {
  try {
    return readdirSync(runsDir())
      .filter(isRunFile)
      .sort()
      .reverse()
      .slice(0, limit)
      .map((name) => readJson<RefreshRunLog>(path.join(runsDir(), name)))
      .filter((log): log is RefreshRunLog => log != null)
      .map(summary);
  } catch {
    return [];
  }
}

export function readRefreshRun(file: string): RefreshRunLog | null {
  if (!isRunFile(file)) return null;
  return readJson<RefreshRunLog>(path.join(runsDir(), file));
}

export function listSchedulerDays(limit = 30): string[] {
  try {
    return readdirSync(schedulerDir())
      .filter((name) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$/.test(name))
      .sort()
      .reverse()
      .slice(0, limit)
      .map((name) => name.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export function readSchedulerLog(date: string): RefreshSchedulerLog | null {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return null;
  return readJson<RefreshSchedulerLog>(path.join(schedulerDir(), `${date}.json`));
}

/** Delete run/scheduler files older than `days`; status.json is kept. */
export function pruneRefreshLogs(days = LOG_RETENTION_DAYS): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const dir of [runsDir(), schedulerDir()]) {
    if (!existsSync(dir)) continue;
    try {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        const file = path.join(dir, name);
        try {
          if (statSync(file).mtimeMs < cutoff) {
            rmSync(file);
            removed++;
          }
        } catch {
          // Ignore an individual unreadable/unremovable file.
        }
      }
    } catch {
      // Ignore a missing/unreadable directory.
    }
  }
  return removed;
}

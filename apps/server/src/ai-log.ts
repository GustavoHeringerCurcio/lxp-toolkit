/**
 * JSON logs for every AI generation.
 *
 * One JSON object per line in `data/logs/ai/YYYY-MM-DD.jsonl`, plus a
 * `latest/item-<id>.json` snapshot for the newest generation of each activity.
 * These logs are for agents: they include the full prompt, completion, gate
 * judgment and attachment diagnostics so a failure can be understood without
 * asking the user to copy/paste anything.
 *
 * Local and gitignored. Never write API keys, auth tokens or base64 payloads.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assist } from "./paths.js";
import type { GateResult } from "./types.js";

export const AI_LOG_KEEP_DAYS = Number(process.env.AI_LOG_KEEP_DAYS ?? 30) || 30;

export interface AiLogRecord {
  schema: 1;
  createdAt: string;
  app: { version: string; commit: string | null };
  contentItemId: number | null;
  answerAttemptId: number | null;
  promptHash: string | null;
  activity: Record<string, unknown>;
  config: Record<string, unknown>;
  project: unknown;
  template: Record<string, unknown>;
  attachments: unknown;
  prompt: string;
  output: Record<string, unknown>;
  gate: GateResult | null;
  gateDebug: unknown;
  errors: string[];
}

export interface AiLogResult {
  file: string;
  latest: string;
}

export function aiLogDir(): string {
  return assist("data", "logs", "ai");
}

function redact(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v, k);
    return out;
  }
  if (typeof value !== "string") return value;
  if (/authorization|api[_-]?key|access[_-]?token|toolkit[_-]?token/i.test(key)) return "[redacted]";
  if (/data:[^;]+;base64,/i.test(value)) return "[base64 removed]";
  return value;
}

/** Delete daily files older than `keepDays`. Exported for tests. */
export function pruneAiLogs(dir: string, keepDays = AI_LOG_KEEP_DAYS, now = Date.now()): string[] {
  if (!existsSync(dir)) return [];
  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
    const file = path.join(dir, name);
    try {
      if (statSync(file).mtimeMs < cutoff) {
        rmSync(file, { force: true });
        removed.push(file);
      }
    } catch {
      /* best-effort */
    }
  }
  return removed;
}

/** Append one generation log and refresh the per-item latest snapshot. */
export function writeAiLog(
  record: AiLogRecord,
  opts: { dir?: string; keepDays?: number } = {},
): AiLogResult {
  const dir = opts.dir ?? aiLogDir();
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "latest"), { recursive: true });

  const safe = redact(record) as AiLogRecord;
  const day = safe.createdAt.slice(0, 10);
  const file = path.join(dir, `${day}.jsonl`);
  appendFileSync(file, `${JSON.stringify(safe)}\n`, "utf-8");

  const id = safe.contentItemId ?? "unknown";
  const latest = path.join(dir, "latest", `item-${id}.json`);
  writeFileSync(latest, `${JSON.stringify(safe, null, 2)}\n`, "utf-8");

  pruneAiLogs(dir, opts.keepDays);
  return { file, latest };
}

/** Build the standard app descriptor (no secrets). */
export function aiLogApp(): AiLogRecord["app"] {
  return {
    version: process.env.APP_VERSION ?? "0.1.0",
    commit: process.env.GIT_COMMIT ?? null,
  };
}

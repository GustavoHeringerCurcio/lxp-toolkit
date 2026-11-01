/**
 * One-off export of historical drafts + gate results to JSON, for AI analysis.
 *
 *   npm run ai:export -- --item 89612062
 *   npm run ai:export -- --limit 50
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closePool, query } from "./db.js";
import { aiLogDir } from "./ai-log.js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
}

interface Row {
  id: string;
  content_item_id: string;
  title: string | null;
  created_at: Date;
  source: string;
  content: string;
  gate_json: unknown;
  prompt: string | null;
  completion: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  prompt_hash: string | null;
}

async function main(): Promise<void> {
  const item = Number(arg("item"));
  const limit = Math.min(500, Math.max(1, Number(arg("limit") ?? 50) || 50));
  const rows = await query<Row>(
    `SELECT aa.id, aa.content_item_id, ci.title, aa.created_at, aa.source, aa.content,
            aa.gate_json, ar.prompt, ar.completion, ar.model, ar.tokens_in, ar.tokens_out,
            ar.latency_ms, ar.prompt_hash
       FROM answer_attempt aa
       LEFT JOIN content_item ci ON ci.id = aa.content_item_id
       LEFT JOIN ai_run ar ON ar.answer_attempt_id = aa.id
      WHERE ($1::bigint IS NULL OR aa.content_item_id = $1)
      ORDER BY aa.created_at DESC
      LIMIT $2`,
    [Number.isFinite(item) && item > 0 ? item : null, limit],
  );
  const dir = aiLogDir();
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `export-${stamp}.json`);
  const payload = {
    exportedAt: new Date().toISOString(),
    itemId: item || null,
    attempts: rows.map((r) => ({
      answerAttemptId: Number(r.id),
      contentItemId: Number(r.content_item_id),
      title: r.title,
      createdAt: r.created_at,
      source: r.source,
      draft: r.content,
      gate: r.gate_json,
      generation: {
        prompt: r.prompt,
        completion: r.completion,
        model: r.model,
        promptHash: r.prompt_hash,
        tokensIn: r.tokens_in,
        tokensOut: r.tokens_out,
        latencyMs: r.latency_ms,
      },
    })),
  };
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(file);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());

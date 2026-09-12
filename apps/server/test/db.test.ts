import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, healthCheck, query, runMigrations } from "../src/db.js";

let available = false;

beforeAll(async () => {
  try {
    await healthCheck();
    available = true;
  } catch {
    available = false;
  }
});

afterAll(async () => {
  if (available) await closePool();
});

describe("migrations", () => {
  it("aplica o schema e é idempotente", async (ctx) => {
    if (!available) return ctx.skip();

    await runMigrations();
    // Re-running with no new files must not apply anything.
    expect(await runMigrations()).toEqual([]);

    const tables = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const names = new Set(tables.map((t) => t.table_name));
    for (const expected of ["content_item", "professor", "module_professor", "question", "item_state", "answer_attempt"]) {
      expect(names.has(expected), expected).toBe(true);
    }
  });
});

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession } from "../src/session.js";
import { NetworkRecorder } from "../src/network.js";
import { config } from "../src/config.js";
import { ensureDir, json, resolveOut } from "../src/util.js";

/**
 * Forum WRITE discovery (final Phase 0 step). Headful:
 *  1. navigate to the forum topic,
 *  2. dump the full posts list via the read action (enrollment flavor),
 *  3. spy-wrap every forum-related Vuex action + log $axios requests,
 *  4. wait while the user posts one reply through the real UI (no timeout dump
 *     until a write is seen, a stop-file appears, or max-wait elapses),
 *  5. dump spy payloads + network capture.
 *
 * Usage: tsx scripts/capture-forum-write.ts [courseId] [topicId] [enrollmentId]
 */

const courseId = process.argv[2] ?? "5254272";
const topicId = process.argv[3] ?? "89612128";
const enrollmentId = process.argv[4] ?? "120887299";
const maxWaitMs = 600_000;
const stopFile = "C:\\Users\\herin\\AppData\\Local\\Temp\\opencode\\forum-capture.stop";

async function main(): Promise<void> {
  const session = await createSession({ headful: true });
  const recorder = new NetworkRecorder(session.page);
  try {
    const { page } = session;
    const clientNav = (p: string): Promise<void> =>
      page
        .evaluate((r) => {
          const w = window as unknown as { $nuxt?: { $router: { push(p: string): Promise<unknown> } } };
          return w.$nuxt?.$router.push(r);
        }, p)
        .then(() => {});

    await page.waitForTimeout(6_000);
    await clientNav(`/course/${courseId}/content/${topicId}`);
    await page.waitForTimeout(10_000);

    // 1. Full posts response via the read action.
    const posts = await page
      .evaluate(
        ({ enrollmentId, topicId }) =>
          (window as unknown as {
            $nuxt?: { $store?: { dispatch(a: string, p: unknown): Promise<unknown> } };
          }).$nuxt?.$store
            ?.dispatch("plataforma/enrollment/actionGetPostsByTopicId", {
              enrollmentId: Number(enrollmentId),
              topicId: Number(topicId),
            })
            .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
        { enrollmentId, topicId },
      )
      .catch(() => null);
    const rawDir = ensureDir(resolveOut(config.outDir, "raw"));
    writeFileSync(path.join(rawDir, "forum-posts-sample.json"), json(posts), "utf-8");
    console.log(`posts sample written (${Array.isArray(posts) ? posts.length : "n/a"} items)`);

    // 2. axios logger + action spy.
    await page
      .evaluate(() => {
        const w = window as unknown as {
          $nuxt?: {
            $axios?: Record<string, unknown>;
            $store?: { _actions?: Record<string, ((payload?: unknown) => unknown)[]> };
          };
        };
        const ax = w.$nuxt?.$axios as { interceptors?: { request?: { use(fn: unknown): void } } } | undefined;
        const log = window as unknown as { __axLog?: unknown[]; __spyLog?: unknown[] };
        log.__axLog = [];
        log.__spyLog = [];
        ax?.interceptors?.request?.use((cfg: unknown) => {
          const c = cfg as { url?: string; method?: string; data?: unknown };
          log.__axLog?.push({ method: c.method, url: c.url, data: c.data });
          return cfg;
        });
        const store = w.$nuxt?.$store;
        for (const [name, fns] of Object.entries(store?._actions ?? {})) {
          if (!/post|forum|like|comment/i.test(name)) continue;
          const orig = fns[0];
          fns[0] = function spied(this: unknown, payload?: unknown) {
            log.__spyLog?.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) });
            return orig.call(this, payload);
          };
        }
      })
      .catch((err) => console.log("patch failed:", err instanceof Error ? err.message : String(err)));

    console.log("\n=== POST ONE REPLY IN THE FORUM NOW (real UI, real account). ===\n");

    const started = Date.now();
    let done = false;
    while (Date.now() - started < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 3_000));
      if (stopFile && existsSync(stopFile)) {
        console.log("stop-file detected.");
        break;
      }
      const spyLen = await page.evaluate(() => (window as unknown as { __spyLog?: unknown[] }).__spyLog?.length ?? 0);
      if (spyLen > 0) {
        const writes = (await page.evaluate(
          () => (window as unknown as { __axLog?: unknown[] }).__axLog,
        )) as { method: string; url: string; data: unknown }[];
        if (writes.some((c) => /post|forum|comment/i.test(c.url ?? "") && ["post", "put", "patch"].includes(String(c.method)))) {
          console.log("write request seen — settling 12s…");
          await new Promise((r) => setTimeout(r, 12_000));
          done = true;
          break;
        }
      }
    }
    if (!done) console.log("max wait elapsed; dumping whatever was captured.");

    // 3. Dump spy + axios + network.
    const spy = await page.evaluate(() => (window as unknown as { __spyLog?: unknown[] }).__spyLog).catch(() => null);
    const axLog = await page.evaluate(() => (window as unknown as { __axLog?: unknown[] }).__axLog).catch(() => null);
    writeFileSync(path.join(rawDir, "forum-write-spy.json"), json({ spy, axios: axLog }), "utf-8");
    const capture = recorder.dump();
    writeFileSync(path.join(rawDir, "api-calls-forum-write.json"), json(capture), "utf-8");

    console.log(`\nspy entries: ${Array.isArray(spy) ? spy.length : 0}`);
    for (const s of (spy ?? []) as { name: string; payload: unknown }[]) {
      console.log(`  ${s.name} ← ${JSON.stringify(s.payload)?.slice(0, 300)}`);
    }
    console.log(`network: ${capture.requests.length} requests, ${capture.responses.length} responses`);
    const writes = capture.requests.filter((r) => ["POST", "PUT", "PATCH"].includes(r.method) && r.url.includes("api.plataforma"));
    console.log(`write calls: ${writes.length}`);
    for (const r of writes) console.log(`  ${r.method} ${r.url} body=${r.postData?.slice(0, 300) ?? "(none)"}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

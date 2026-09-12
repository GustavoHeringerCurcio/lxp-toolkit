import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession } from "../src/session.js";
import { NetworkRecorder } from "../src/network.js";
import { config, logger } from "../src/config.js";
import { ensureDir, json, resolveOut } from "../src/util.js";

/**
 * Headful capture focused on the forum flow: navigate to a forum topic, wait
 * while the user opens the composer and posts one reply manually, then dump
 * every captured API call. Finishes by itself — no stdin/Enter needed:
 *   - trigger: any POST/PUT/PATCH to the platform API seen after the warmup
 *     (plus a settle window), or
 *   - a `--stop-file` appearing, or
 *   - the max wait elapsing.
 *
 * Usage:
 *   tsx scripts/capture-forum.ts [--url <item url>] [--max-wait-ms 600000]
 *                                [--stop-file <path>]
 * Output:
 *   scraped/raw/api-calls-forum.json + scraped/forum-captured.md
 */

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const urlFlag = flagValue(args, "--url");
  const maxWaitMs = Number(flagValue(args, "--max-wait-ms") ?? 600_000);
  const stopFile = flagValue(args, "--stop-file");

  let contentPath = "/course/5254272/content/89612128";
  if (urlFlag) {
    try {
      contentPath = "/" + new URL(urlFlag).pathname.replace(/^\/plataforma\/?/, "");
    } catch {
      contentPath = urlFlag;
    }
  }

  const session = await createSession({ headful: true });
  try {
    const page = session.page;
    const recorder = new NetworkRecorder(page);

    const clientNav = (p: string): Promise<void> =>
      page
        .evaluate((r) => {
          const w = window as unknown as { $nuxt?: { $router: { push(p: string): Promise<unknown> } } };
          return w.$nuxt?.$router.push(r);
        }, p)
        .then(() => {});

    await page.waitForTimeout(8_000);
    logger.info({ contentPath }, "navigating to forum topic");
    await clientNav(contentPath);
    await page.waitForTimeout(8_000);

    console.log("\n=== INTERACT NOW: open the forum composer and post one reply. ===");
    console.log(`Capturing until a write request is seen (or ${Math.round(maxWaitMs / 1000)}s elapse)…\n`);

    const started = Date.now();
    // Ignore writes seen during the first seconds of page load (telemetry).
    const warmupUntil = started + 60_000;
    let seenWrites: { method: string; url: string }[] = [];
    let triggered = false;

    while (Date.now() - started < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 2_000));
      if (stopFile && existsSync(stopFile)) {
        console.log("stop-file detected, finishing capture.");
        break;
      }
      const writes = recorder.requests
        .filter((r) => WRITE_METHODS.has(r.method) && r.url.includes("api.plataforma.grupoa.education"))
        .map((r) => ({ method: r.method, url: r.url }));
      const fresh = writes.filter((w) => !seenWrites.some((s) => s.method === w.method && s.url === w.url));
      for (const w of fresh) console.log(`  [write] ${w.method} ${w.url}`);
      seenWrites = writes;
      const afterWarmup = Date.now() > warmupUntil;
      const forumish = writes.find((w) => /post|forum|comment|reply/i.test(w.url));
      if ((afterWarmup && writes.length > 0) || forumish) {
        if (!triggered) console.log("\nwrite request captured — settling 15s before dump…\n");
        triggered = true;
        await new Promise((r) => setTimeout(r, 15_000));
        break;
      }
    }
    if (!triggered) console.log("\nmax wait elapsed without a detected write; dumping anyway.");

    recorder.logSummary();
    const capture = recorder.dump();

    const rawDir = ensureDir(resolveOut(config.outDir, "raw"));
    writeFileSync(path.join(rawDir, "api-calls-forum.json"), json(capture), "utf-8");

    const lines: string[] = ["# Captured forum API traffic", ""];
    lines.push(`- Requests: ${capture.requests.length}`);
    lines.push(`- Responses: ${capture.responses.length}`, "");
    for (const r of capture.requests.filter((x) => WRITE_METHODS.has(x.method))) {
      lines.push(`## \`${r.method} ${r.url}\``, "", "```http", `${r.method} ${r.url}`);
      for (const [k, v] of Object.entries(r.headers)) {
        if (/authorization|cookie/i.test(k)) continue;
        lines.push(`${k}: ${v}`);
      }
      if (r.postData) lines.push("", r.postData);
      lines.push("```", "");
    }
    for (const r of capture.requests.filter((x) => /forum|post|comment/i.test(x.url))) {
      const res = capture.responses.find((x) => x.url === r.url && x.requestId === r.id);
      lines.push(`## read \`${r.method} ${r.url}\` → ${res?.status ?? "?"}`, "");
      if (res?.body) lines.push("```json", res.body.slice(0, 4_000), "```", "");
    }
    writeFileSync(resolveOut(config.outDir, "forum-captured.md"), lines.join("\n"), "utf-8");

    console.log(`\nCaptured ${capture.requests.length} request(s), ${capture.responses.length} response(s)`);
    console.log(`Docs → ${resolveOut(config.outDir, "forum-captured.md")}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "forum capture failed");
  console.error(err);
  process.exit(1);
});

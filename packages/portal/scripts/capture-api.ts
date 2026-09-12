import { writeFileSync } from "node:fs";
import path from "node:path";
import { createSession, closeSession } from "../src/session.js";
import { NetworkRecorder } from "../src/network.js";
import { config, logger } from "../src/config.js";
import { codeBlock, tableCell } from "../src/markdown.js";
import { ensureDir, json, resolveOut } from "../src/util.js";

function renderApiMarkdown(recorder: NetworkRecorder): string {
  const lines: string[] = [];
  lines.push("# Captured API traffic");
  lines.push("");
  lines.push(`- Requests: ${recorder.requests.length}`);
  lines.push(`- Responses: ${recorder.responses.length}`);
  lines.push("");

  const byHost = new Map<string, number>();
  for (const r of recorder.requests) {
    try {
      const host = new URL(r.url).hostname;
      byHost.set(host, (byHost.get(host) ?? 0) + 1);
    } catch {
      /* skip */
    }
  }
  lines.push("## Hosts");
  lines.push("");
  for (const [host, count] of byHost) lines.push(`- \`${host}\` — ${count}`);
  lines.push("");

  lines.push("## Requests");
  lines.push("");
  for (const r of recorder.requests) {
    lines.push(`### \`${r.method} ${r.url}\``);
    lines.push("");
    lines.push("```http");
    lines.push(`${r.method} ${r.url}`);
    for (const [k, v] of Object.entries(r.headers)) {
      if (/authorization|cookie/i.test(k)) continue;
      lines.push(`${k}: ${v}`);
    }
    if (r.postData) lines.push(`\n${r.postData}`);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Responses");
  lines.push("");
  for (const res of recorder.responses) {
    lines.push(`### \`${res.status} ${res.url}\``);
    lines.push("");
    if (res.body) {
      const trimmed = res.body.length > 4000 ? res.body.slice(0, 4000) + "\n…[truncated]" : res.body;
      lines.push(codeBlock(trimmed, isJson(res.headers["content-type"]) ? "json" : "text"));
      lines.push("");
    }
  }
  return lines.join("\n");
}

function isJson(contentType: string | undefined): boolean {
  return Boolean(contentType && /json/i.test(contentType));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const urlFlag = args.indexOf("--url");
  const targetUrl = urlFlag >= 0 ? args[urlFlag + 1] : undefined;
  const headful = args.includes("--headful");

  const session = await createSession({ headful });
  try {
    const page = session.page;
    const recorder = new NetworkRecorder(page);

    // The token dies on a full page reload, so navigate via the SPA router only.
    const clientNav = (path: string): Promise<void> =>
      page
        .evaluate((p) => {
          const w = window as unknown as { $nuxt?: { $router: { push(p: string): Promise<unknown> } } };
          return w.$nuxt?.$router.push(p);
        }, path)
        .then(() => {});

    // 1. Capture the home dashboard's initial API calls.
    await page.waitForTimeout(8_000);

    // 2. Subjects list.
    await clientNav("/my-enrollments/courses");
    await page.waitForTimeout(6_000);

    // 3. A course content page (quiz + upload traffic). Defaults to the known
    //    course/item; override with --url <full item url>.
    let contentPath = "/course/5254272/content/89612190";
    if (targetUrl) {
      try {
        contentPath = "/" + new URL(targetUrl).pathname.replace(/^\/plataforma\/?/, "");
      } catch {
        contentPath = targetUrl;
      }
    }
    logger.info({ contentPath }, "navigating to content page for capture");
    await clientNav(contentPath);
    await page.waitForTimeout(8_000);

    if (headful) {
      console.log("\nHeadful mode: interact with the page to trigger write endpoints, then press Enter to finish.");
      await new Promise<void>((resolve) => {
        process.stdin.once("data", () => resolve());
      });
    }

    recorder.logSummary();
    const capture = recorder.dump();

    const rawDir = resolveOut(config.outDir, "raw");
    ensureDir(rawDir);
    writeFileSync(path.join(rawDir, "api-calls.json"), json(capture), "utf-8");
    writeFileSync(resolveOut(config.outDir, "api-captured.md"), renderApiMarkdown(recorder), "utf-8");

    console.log(`\nCaptured ${capture.requests.length} request(s), ${capture.responses.length} response(s)`);
    console.log(`Docs → ${resolveOut(config.outDir, "api-captured.md")}`);
  } finally {
    await closeSession(session);
  }
}

main().catch((err) => {
  logger.error({ err }, "capture failed");
  console.error(err);
  process.exit(1);
});

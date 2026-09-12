// Preflight health check: `npm run doctor`
// Verifies this machine can run the scraper + the app.
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  ROOT,
  PORTAL_ENV,
  SERVER_ENV,
  CONTENT_TREE,
  c,
  log,
  ok,
  bad,
  run,
  commandExists,
  readEnvFile,
} from "./shared.mjs";

const checks = [];
const add = (name, status, detail = "") => checks.push({ name, status, detail });

// 1. Node version
const major = Number(process.versions.node.split(".")[0]);
add(
  "Node.js >= 22",
  major >= 22 ? "ok" : "fail",
  major >= 22 ? `v${process.versions.node}` : `found v${process.versions.node} — install from https://nodejs.org`,
);

// 2. Dependencies installed
const depsOk = existsSync(path.join(ROOT, "node_modules")) && existsSync(path.join(ROOT, "node_modules", "@lxp-toolkit"));
add("Dependencies installed", depsOk ? "ok" : "fail", depsOk ? "" : "run: npm install");

// 3. Playwright Chromium browser
let pwStatus = "fail";
let pwDetail = "run: npx playwright install chromium";
try {
  const { chromium } = await import("playwright");
  const exe = chromium.executablePath();
  if (existsSync(exe)) {
    pwStatus = "ok";
    pwDetail = "";
  }
} catch {
  pwDetail = "playwright not installed — run: npm install";
}
add("Playwright Chromium", pwStatus, pwDetail);

// 4. Portal credentials
const portal = readEnvFile(PORTAL_ENV);
const credsOk = Boolean(portal?.LXP_USERNAME && portal?.LXP_PASSWORD);
add(
  "Portal credentials (.env)",
  credsOk ? "ok" : "fail",
  credsOk ? "" : "missing LXP_USERNAME/LXP_PASSWORD — run: npm run setup",
);

// 5. OpenAI key
const server = readEnvFile(SERVER_ENV);
const key = server?.OPENAI_API_KEY ?? "";
const keyOk = key.length > 0 && key !== "sk-...";
add("OpenAI API key (.env)", keyOk ? "ok" : "fail", keyOk ? "" : "missing OPENAI_API_KEY — run: npm run setup");

// 6. Scraped content
add(
  "Scraped content",
  existsSync(CONTENT_TREE) ? "ok" : "warn",
  existsSync(CONTENT_TREE) ? "" : "none yet — run: npm run dump",
);

// 7. LibreOffice (optional — PDF/Office features)
const soffice = await commandExists("soffice");
add(
  "LibreOffice (optional)",
  soffice ? "ok" : "warn",
  soffice ? "" : "not found — .pdf delivery and Office previews disabled (set SOFFICE_BIN if installed elsewhere)",
);

// 8. Port 4174 free
const portFree = await new Promise((resolve) => {
  const srv = net.createServer();
  srv.once("error", () => resolve(false));
  srv.once("listening", () => srv.close(() => resolve(true)));
  srv.listen(4174, "127.0.0.1");
});
add("Port 4174 free", portFree ? "ok" : "warn", portFree ? "" : "in use — stop the other process or set PORT in apps/server/.env");

// 9. Git hooks (PII guard)
const hooks = await run("git", ["config", "--get", "core.hooksPath"], { capture: true });
const hooksOk = hooks.code === 0 && hooks.output.trim() === ".githooks";
add(
  "PII commit guard enabled",
  hooksOk ? "ok" : "warn",
  hooksOk ? "" : "run: git config core.hooksPath .githooks",
);

// Report
log(`\n${c.bold("lxp-toolkit doctor")}\n`);
const symbol = { ok: c.green("✓"), warn: c.yellow("!"), fail: c.red("✗") };
for (const { name, status, detail } of checks) {
  log(`  ${symbol[status]} ${name}${detail ? c.dim(` — ${detail}`) : ""}`);
}
const failed = checks.filter((x) => x.status === "fail").length;
const warned = checks.filter((x) => x.status === "warn").length;
log("");
if (failed === 0) {
  ok(warned === 0 ? "Everything looks good." : `Ready, with ${warned} warning(s).`);
} else {
  bad(`${failed} problem(s) to fix above.`);
}
process.exit(failed === 0 ? 0 : 1);

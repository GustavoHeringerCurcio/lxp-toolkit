// Local development server: `npm run dev`
//
// Runs the backend API and the Vite dev server together, so the UI has hot
// module replacement (HMR) while `/api` is proxied to the backend:
//
//   apps/server  → tsx server/server.ts   http://localhost:4174  (API)
//   apps/web     → vite                   http://localhost:5174  (HMR)
//
// Open http://localhost:5174 — editing apps/web/src/** reloads instantly.
//
// `npm run dev` is FAST: it does not scrape the portal. The API's bootstrap
// still applies migrations and rebuilds the projection from the data you
// already have, so it is correct with zero wait.
//
// Want fresh portal content? Use `npm run dev:fresh` (or pass `--sync`): it
// runs scripts/sync.mjs (Postgres → migrations → dump → index) before starting.
//
// No extra dependency: both children are spawned with Node built-ins, logs go
// straight to this terminal, and Ctrl+C tears down the whole process tree.
import { spawn } from "node:child_process";
import { ROOT, c, log, warn, step, run, frame } from "../setup/shared.mjs";

const isWin = process.platform === "win32";

if (process.argv.includes("--sync")) {
  step("Atualizando conteúdo (sync)");
  const synced = await run("node", ["scripts/sync.mjs"], { tee: true });
  if (synced.code !== 0) process.exit(synced.code ?? 1);
}

function quoteWin(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

function start(name, command, args, color) {
  const opts = {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
    windowsHide: false,
  };
  // `.cmd` shims (npm) need a shell on Windows; pass one quoted command string
  // so Node does not emit DEP0190 (args + shell together).
  const child = isWin
    ? spawn([command, ...args].map(quoteWin).join(" "), { ...opts, shell: true })
    : spawn(command, args, opts);
  child.__name = name;
  child.__color = color;
  return child;
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (isWin) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

const children = [
  start("api", "npm", ["run", "start", "-w", "@lxp-toolkit/server"], c.cyan),
  start("web", "npm", ["run", "dev", "-w", "@lxp-toolkit/web"], c.green),
];

log(
  "\n" +
    frame([
      `${c.bold("lxp-toolkit")} ${c.dim("·")} ${c.cyan("dev")}`,
      "",
      `${c.green("●")} ${c.bold("web")}   ${c.bold("http://localhost:5174")}   ${c.dim("abra esta · HMR")}`,
      `${c.cyan("●")} ${c.bold("api")}   ${c.dim("http://localhost:4174")}`,
      "",
      `${c.dim("edite apps/web/src/** e a página recarrega sozinha")}`,
      `${c.dim("Ctrl+C encerra api + web")}`,
    ]) +
    "\n",
);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child);
  // Give taskkill a moment before exiting on Windows.
  setTimeout(() => process.exit(code), isWin ? 400 : 0);
}

for (const child of children) {
  child.on("error", (err) => {
    warn(`${child.__name}: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal) warn(`${child.__name} encerrado (${signal}).`);
    shutdown(code ?? 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

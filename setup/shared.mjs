// Shared helpers for the lxp-toolkit setup wizard + doctor.
// Zero dependencies (Node built-ins only), cross-platform.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (setup/ → ..). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PORTAL_ENV = path.join(ROOT, "packages", "portal", ".env");
export const SERVER_ENV = path.join(ROOT, "apps", "server", ".env");
export const PROFILE_JSON = path.join(ROOT, "apps", "server", "config", "profile.json");
export const CONTENT_TREE = path.join(ROOT, "scraped", "raw", "content-tree.json");

/** Default local Postgres provided by the repo's docker-compose.yml. */
export const DATABASE_URL_DEFAULT = "postgres://lxp:lxp@localhost:5433/lxp";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  green: wrap("32"),
  yellow: wrap("33"),
  red: wrap("31"),
  cyan: wrap("36"),
};

export const log = (msg = "") => console.log(msg);
export const ok = (msg) => console.log(`${c.green("✓")} ${msg}`);
export const warn = (msg) => console.log(`${c.yellow("!")} ${msg}`);
export const bad = (msg) => console.log(`${c.red("✗")} ${msg}`);
export const step = (msg) => console.log(`\n${c.bold(c.cyan("▸"))} ${c.bold(msg)}`);

function quoteWin(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/**
 * Run a command. `tee` streams output live while capturing it (for captcha
 * detection); `capture` only captures; default inherits stdio.
 */
export function run(command, args = [], opts = {}) {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const spawnOpts = {
      cwd: opts.cwd ?? ROOT,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: opts.capture || opts.tee ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: false,
    };
    // On Windows, `.cmd` shims (npm, npx) need a shell; pass one quoted command
    // string to avoid Node's DEP0190 (args + shell) warning.
    const child = isWin
      ? spawn([command, ...args].map(quoteWin).join(" "), { ...spawnOpts, shell: true })
      : spawn(command, args, spawnOpts);
    let output = "";
    const sink = (stream, out) =>
      stream?.on("data", (d) => {
        output += d.toString();
        if (opts.tee) out.write(d);
      });
    sink(child.stdout, process.stdout);
    sink(child.stderr, process.stderr);
    child.on("error", (error) => resolve({ code: 1, error, output }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

export async function commandExists(command, args = ["--version"]) {
  const res = await run(command, args, { capture: true });
  return res.code === 0;
}

/** Run `docker compose <args>` from the repo root. */
export function dockerCompose(args, opts = {}) {
  return run("docker", ["compose", ...args], opts);
}

// A single readline interface for interactive prompts, or a line queue when
// stdin is piped (so scripted/non-interactive runs work too).
let rl = null;
let piped = null;
let pipedIndex = 0;

function iface() {
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return rl;
}

async function nextPiped(echo) {
  if (!piped) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    piped = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
  }
  const value = (piped[pipedIndex++] ?? "").trim();
  if (echo) process.stdout.write(value + "\n");
  return value;
}

export async function ask(question, { defaultValue = "" } = {}) {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    const answer = await nextPiped(true);
    return answer || defaultValue;
  }
  return new Promise((resolve) => {
    iface().question(question, (answer) => resolve(answer.trim() || defaultValue));
  });
}

/** Ask without echoing the typed value (plain read when stdin is piped). */
export async function askHidden(question) {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    const value = await nextPiped(false);
    process.stdout.write("\n");
    return value;
  }
  const i = iface();
  return new Promise((resolve) => {
    const original = typeof i._writeToOutput === "function" ? i._writeToOutput.bind(i) : null;
    i._writeToOutput = (s) => {
      if (s.includes(question)) i.output.write(s);
      else if (/^\r?\n$/.test(s)) i.output.write("\n");
      else i.output.write("*");
    };
    i.question(question, (answer) => {
      if (original) i._writeToOutput = original;
      i.output.write("\n");
      resolve(answer.trim());
    });
  });
}

export async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const ans = (await ask(`${question} ${hint} `)).toLowerCase();
  if (!ans) return defaultYes;
  return ["y", "yes", "s", "sim"].includes(ans);
}

/** Serialize one dotenv line, quoting values that need it. */
export function envLine(key, value) {
  const needsQuote = /[\s#"']/.test(value);
  return `${key}=${needsQuote ? JSON.stringify(value) : value}`;
}

export function readEnvFile(file) {
  if (!existsSync(file)) return null;
  const map = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    map[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return map;
}

/** Write a file, backing up any existing one to `<file>.bak`. */
export function writeWithBackup(file, content) {
  if (existsSync(file)) {
    writeFileSync(`${file}.bak`, readFileSync(file), "utf8");
  }
  writeFileSync(file, content, "utf8");
}

/**
 * Ensure `<key>=<value>` is present in an env file, appending it when missing.
 * Returns true when the line was added (useful for existing installs that
 * predate a newly required variable such as `DATABASE_URL`).
 */
export function ensureEnvLine(file, key, value) {
  if (!existsSync(file)) {
    writeFileSync(file, `${key}=${value}\n`, "utf8");
    return true;
  }
  const content = readFileSync(file, "utf8");
  if (new RegExp(`^\\s*${key}\\s*=`, "m").test(content)) return false;
  const sep = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  writeFileSync(file, `${content}${sep}${key}=${value}\n`, "utf8");
  return true;
}

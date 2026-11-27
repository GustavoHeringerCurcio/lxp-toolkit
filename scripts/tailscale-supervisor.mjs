// Keep the Tailscale URL pointing at the running LXP Toolkit app.
//
//   node scripts/tailscale-supervisor.mjs          # loop forever (logon task)
//   node scripts/tailscale-supervisor.mjs --once   # one check, then exit
//
// The chain is:
//   https://<node>.<tailnet>.ts.net:443 -> 127.0.0.1:4175 (gate) -> 127.0.0.1:4174 (app)
//
// The app runs in Docker and may start after the user logs in. This supervisor
// waits for it, starts the password gate when needed, and re-applies the Funnel
// mapping if Tailscale lost it. It never resets other serve/funnel entries.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "http://127.0.0.1:4174";
const GATE = "http://127.0.0.1:4175";
const GATE_TARGET = "http://127.0.0.1:4175";
const LOG = path.join(ROOT, "apps", "server", "data", "logs", "tailscale.log");
const INTERVAL_MS = 30_000;
const once = process.argv.includes("--once");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    mkdirSync(path.dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${line}\n`);
  } catch {
    /* logging is best effort */
  }
}

function run(command, args) {
  const res = spawnSync(command, args, { encoding: "utf8", timeout: 15_000 });
  return {
    ok: res.status === 0 && !res.error,
    out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim(),
    error: res.error,
  };
}

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitUp(url, tries = 10) {
  for (let i = 0; i < tries; i++) {
    if (await isUp(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function ensureGate() {
  if (await isUp(`${GATE}/__gate`)) return true;
  log("gate fora do ar; iniciando gate-proxy em 127.0.0.1:4175");
  const started = run(process.execPath, [path.join(ROOT, "scripts", "gate-proxy.mjs"), "--start"]);
  if (!started.ok) {
    log(`falha ao iniciar o gate: ${started.out || started.error || "erro"}`);
    return false;
  }
  const up = await waitUp(`${GATE}/__gate`);
  log(up ? "gate iniciado" : "gate ainda não respondeu");
  return up;
}

function tailnetName() {
  const res = run("tailscale", ["status", "--json"]);
  if (!res.ok) return null;
  try {
    const dns = (JSON.parse(res.out).Self?.DNSName ?? "").replace(/\.$/, "");
    return dns || null;
  } catch {
    return null;
  }
}

function serveJson() {
  const res = run("tailscale", ["serve", "status", "--json"]);
  if (!res.ok) return null;
  try {
    return JSON.parse(res.out);
  } catch {
    return null;
  }
}

function current443Target() {
  const status = serveJson();
  if (!status?.Web) return null;
  const node = tailnetName();
  if (!node) return null;
  const key = `${node}:443`;
  const entry = status.Web[key];
  if (!entry) return null;
  return entry.Handlers?.["/"]?.Proxy ?? null;
}

function ensureFunnel() {
  const current = current443Target();
  if (current === GATE_TARGET) return true;
  log(`funnel 443 está em ${current ?? "nenhum"}; apontando para ${GATE_TARGET}`);
  const res = run("tailscale", [
    "funnel",
    "--bg",
    "--https=443",
    GATE_TARGET,
  ]);
  if (!res.ok) {
    log(`falha ao aplicar o funnel: ${res.out || res.error || "erro"}`);
    return false;
  }
  return true;
}

async function tick() {
  if (!(await isUp(`${APP}/api/health`))) {
    log("app 127.0.0.1:4174 indisponível (Docker parado?); aguardando");
    return;
  }
  if (!(await ensureGate())) return;
  ensureFunnel();
}

await tick();
if (!once) {
  setInterval(() => {
    void tick();
  }, INTERVAL_MS);
}

// Expose the LXP Toolkit app to your devices over Tailscale.
//
//   npm run tailscale              # tailnet-only HTTPS on https://<node>.<tailnet>.ts.net
//   npm run tailscale -- --funnel  # public HTTPS on the same URL, behind a password gate
//   npm run tailscale -- --status  # mapping, URL, gate and app reachability
//   npm run tailscale -- --off     # remove the mapping, stop the gate
//
// The app is served locally on 127.0.0.1:4174 (container or `npm run web`).
// Tailscale terminates TLS: private mode proxies straight to the app; --funnel
// starts `scripts/gate-proxy.mjs` on 127.0.0.1:4175 and proxies there, so the
// public URL asks for a password before reaching the unauthenticated API.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "http://127.0.0.1:4174";
const GATE_PORT = Number(process.env.LXP_GATE_PORT ?? 4175);
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

function tailscale(argv) {
  const res = spawnSync("tailscale", argv, { encoding: "utf8" });
  if (res.error) {
    if (res.error.code === "ENOENT") {
      fail("`tailscale` não encontrado no PATH. Instale o Tailscale e entre na sua tailnet.");
    }
    fail(res.error.message);
  }
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

function gate(action) {
  const res = spawnSync(process.execPath, [path.join(ROOT, "scripts", "gate-proxy.mjs"), action], {
    encoding: "utf8",
    env: process.env,
  });
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function nodeName() {
  const res = tailscale(["status", "--json"]);
  if (!res.ok) fail(`tailscale status falhou:\n${res.out}`);
  let self;
  try {
    self = JSON.parse(res.out).Self;
  } catch {
    fail("não consegui ler `tailscale status --json`.");
  }
  const dns = (self?.DNSName ?? "").replace(/\.$/, "");
  if (!dns) fail("Tailscale está rodando mas o nó não tem DNSName (MagicDNS desligado?).");
  return dns;
}

async function up(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitUp(url, tries = 25) {
  for (let i = 0; i < tries; i += 1) {
    if (await up(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function privateOff() {
  tailscale(["funnel", "--https=443", "off"]);
  tailscale(["serve", "--https=443", "off"]);
  tailscale(["serve", "--http=80", "off"]);
  gate("--stop");
}

const name = nodeName();
const url = `https://${name}`;

if (flag("--off")) {
  await privateOff();
  console.log("\n✔ serve/funnel desligados (443/80) e gate parado.\n");
  process.exit(0);
}

if (flag("--status")) {
  const res = tailscale(["serve", "status"]);
  console.log(res.out || "(nenhum mapeamento)");
  const g = gate("--status");
  console.log(`\n${g.ok ? g.out : "gate: parado"}`);
  console.log((await up(`${APP}/api/health`)) ? "app 127.0.0.1:4174: ok ✔" : "app 127.0.0.1:4174: fora ✖");
  console.log(`\nURL: ${url}`);
  process.exit(0);
}

if (!(await up(`${APP}/api/health`))) {
  fail(
    "o app não está respondendo em 127.0.0.1:4174.\n" +
      "  Suba com `docker compose up -d` (container) ou `npm run web` (build + serve) e rode de novo.",
  );
}

if (flag("--funnel")) {
  const started = gate("--start");
  if (!started.ok) fail(`não consegui subir o gate:\n${started.out}`);
  if (!(await waitUp(`http://127.0.0.1:${GATE_PORT}/__gate`))) {
    fail("o gate não respondeu em 127.0.0.1:" + GATE_PORT);
  }

  const funnel = tailscale(["funnel", "--bg", "--https=443", `http://127.0.0.1:${GATE_PORT}`]);
  if (!funnel.ok) fail(`não consegui ligar o funnel:\n${funnel.out}`);

  const passwordFile = path.join(ROOT, ".gate-password");
  const password = existsSync(passwordFile) ? readFileSync(passwordFile, "utf8").trim() : "";
  console.log(`\n✔ Público (com senha): ${url}`);
  if (password) console.log(`  senha: ${password}  (${passwordFile})`);
  else console.log("  senha: definida em LXP_GATE_PASSWORD");
  console.log("  Vale para qualquer aparelho; privado também passa pelo gate.");
  console.log("  Desligue com `npm run tailscale -- --off` ou `tailscale funnel --https=443 off`.");
  process.exit(0);
}

tailscale(["funnel", "--https=443", "off"]);
gate("--stop");

const serve = tailscale(["serve", "--bg", "--https=443", APP]);
if (!serve.ok) fail(`não consegui configurar o serve:\n${serve.out}`);

console.log(`\n✔ LXP Toolkit exposto para a sua tailnet: ${url}`);
console.log("  Só funciona em aparelhos logados na mesma tailnet (Tailscale ligado, MagicDNS ativo).");
console.log("  Quer acesso de qualquer aparelho? `npm run tailscale -- --funnel` (com senha).");

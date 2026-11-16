// Expose the LXP Toolkit app to your own devices over Tailscale.
//
//   npm run tailscale              # tailnet-only HTTPS on https://<node>.<tailnet>.ts.net
//   npm run tailscale -- --status  # show the current mapping + URL
//   npm run tailscale -- --funnel  # ALSO make it reachable from the public internet
//   npm run tailscale -- --off     # remove the mapping
//
// The app is served by the local container (or `npm run web`) on
// 127.0.0.1:4174. Tailscale terminates TLS and proxies to it; the file is
// fetched from your tailnet, never from the internet, unless you pass
// --funnel. Funnel is opt-in because the API has no browser login.
import { spawnSync } from "node:child_process";

const APP = "http://127.0.0.1:4174";
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

async function appUp() {
  try {
    const res = await fetch(`${APP}/api/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

if (flag("--off")) {
  const res = tailscale(["serve", "--https=443", "off"]);
  if (!res.ok) fail(`não consegui desligar o serve:\n${res.out}`);
  console.log("\n✔ serve desligado (https 443).\n");
  process.exit(0);
}

const name = nodeName();
const url = `https://${name}`;

if (flag("--status")) {
  const res = tailscale(["serve", "status"]);
  console.log(res.out || "(nenhum mapeamento)");
  console.log(`\nURL: ${url}`);
  console.log((await appUp()) ? "App: respondendo em 127.0.0.1:4174 ✔" : "App: NÃO está rodando em 127.0.0.1:4174 ✖");
  process.exit(0);
}

if (!(await appUp())) {
  fail(
    "o app não está respondendo em 127.0.0.1:4174.\n" +
      "  Suba com `docker compose up -d` (container) ou `npm run web` (build + serve) e rode de novo.",
  );
}

const serve = tailscale(["serve", "--bg", "--https=443", APP]);
if (!serve.ok) fail(`não consegui configurar o serve:\n${serve.out}`);

console.log(`\n✔ LXP Toolkit exposto para a sua tailnet: ${url}`);
console.log("  Só funciona em aparelhos logados na mesma tailnet (Tailscale ligado, MagicDNS ativo).");

if (flag("--funnel")) {
  const funnel = tailscale(["funnel", "--bg", "--https=443", "on"]);
  if (!funnel.ok) fail(`não consegui ligar o funnel:\n${funnel.out}`);
  console.log(`\n⚠ Funnel LIGADO: ${url} agora é público (qualquer pessoa com o link).`);
  console.log("  A API não tem login de navegador; desligue com `tailscale funnel --https=443 off`.");
}
console.log();

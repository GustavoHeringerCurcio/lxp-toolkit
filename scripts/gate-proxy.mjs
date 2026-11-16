// Password gate in front of the LXP Toolkit app, for when it is exposed with
// Tailscale Funnel (the public URL works from any device, so the unauthenticated
// local API needs a lock).
//
//   npm run gate            # run in the foreground (Ctrl+C stops it)
//   npm run gate -- --start # run detached in the background
//   npm run gate -- --stop  # stop the background process
//   npm run gate -- --status
//
// Listens on 127.0.0.1:4175 and proxies everything to the app on 127.0.0.1:4174
// once the browser has a valid cookie from the login page. The password is read
// from LXP_GATE_PASSWORD or `.gate-password` (created on first run, gitignored).
// `npm run tailscale -- --funnel` starts this automatically.
import { spawn } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_PORT = Number(process.env.LXP_APP_PORT ?? 4174);
const GATE_PORT = Number(process.env.LXP_GATE_PORT ?? 4175);
const PASSWORD_FILE = process.env.LXP_GATE_PASSWORD_FILE ?? path.join(ROOT, ".gate-password");
const PID_FILE = path.join(os.tmpdir(), "lxp-toolkit-gate.pid");
const COOKIE = "lxp_gate";
const MAX_AGE = 30 * 24 * 60 * 60;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

function runPath() {
  return fileURLToPath(import.meta.url);
}

function readPassword() {
  const fromEnv = (process.env.LXP_GATE_PASSWORD ?? "").trim();
  if (fromEnv) return fromEnv;
  if (existsSync(PASSWORD_FILE)) return readFileSync(PASSWORD_FILE, "utf8").trim();
  const generated = randomBytes(9).toString("base64url");
  writeFileSync(PASSWORD_FILE, `${generated}\n`, { mode: 0o600 });
  console.log(`\nSenha criada em ${PASSWORD_FILE}:\n\n    ${generated}\n`);
  return generated;
}

function tokenFor(password) {
  return createHmac("sha256", password).update("lxp-gate-cookie-v1").digest("base64url");
}

function same(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function cookieValue(req) {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return "";
}

function page(message = "") {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>LXP Toolkit</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b0d10; color: #e6e8eb;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  form { width: min(92vw, 340px); padding: 28px; border-radius: 14px;
    background: #14171c; border: 1px solid #232830; }
  h1 { margin: 0 0 4px; font-size: 17px; letter-spacing: .2px; }
  p { margin: 0 0 20px; color: #8b929c; font-size: 13px; }
  input { width: 100%; padding: 11px 12px; border-radius: 9px; margin-bottom: 12px;
    border: 1px solid #2b313a; background: #0b0d10; color: inherit; font-size: 16px; }
  input:focus { outline: none; border-color: #4b8bf5; }
  button { width: 100%; padding: 11px; border: 0; border-radius: 9px;
    background: #2f6fed; color: #fff; font-weight: 600; font-size: 14px; cursor: pointer; }
  button:hover { background: #3d7cf5; }
  .err { color: #f2777a; font-size: 13px; margin: 0 0 12px; }
</style></head>
<body>
  <form method="post" action="/__gate">
    <h1>LXP Toolkit</h1>
    <p>Acesso restrito. Informe a senha.</p>
    ${message ? `<p class="err">${message}</p>` : ""}
    <input type="password" name="password" placeholder="Senha" autofocus
      autocomplete="current-password" required>
    <button type="submit">Entrar</button>
  </form>
</body></html>`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(body);
}

let password = "";
let expected = "";

const attempts = new Map();
function throttled(ip) {
  const entry = attempts.get(ip);
  return entry && entry.count >= 8 && Date.now() < entry.until;
}
function noteFailure(ip) {
  const entry = attempts.get(ip) ?? { count: 0, until: 0 };
  entry.count += 1;
  entry.until = Date.now() + 15 * 60 * 1000;
  attempts.set(ip, entry);
}
function clearFailures(ip) {
  attempts.delete(ip);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      if (body.length < limit) body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

function nextPath(url) {
  const raw = (url ?? "").split("?")[0];
  return raw.startsWith("/") && !raw.startsWith("//") && raw !== "/__gate" ? raw : "/";
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://gate.local");

  if (url.pathname === "/__gate") {
    const ip = req.socket.remoteAddress ?? "?";
    if (req.method === "POST") {
      if (throttled(ip)) return send(res, 429, page("Muitas tentativas. Aguarde alguns minutos."));
      const body = new URLSearchParams(await readBody(req));
      if (same(body.get("password") ?? "", password)) {
        clearFailures(ip);
        return send(res, 303, "", {
          location: nextPath(body.get("next")),
          "set-cookie": `${COOKIE}=${expected}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
        });
      }
      noteFailure(ip);
      return send(res, 401, page("Senha incorreta."));
    }
    return send(res, 200, page());
  }

  if (!expected || !same(cookieValue(req), expected)) {
    if (req.method === "GET" || req.method === "HEAD") {
      return send(res, 401, page(), { "cache-control": "no-store" });
    }
    send(res, 401, "unauthorized", { "content-type": "text/plain" });
    return;
  }

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: APP_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${APP_PORT}` },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) send(res, 502, page("O app não está respondendo (4174)."), { "content-type": "text/plain" });
    else res.end();
  });
  req.pipe(upstream);
});

function alive() {
  return fetch(`http://127.0.0.1:${GATE_PORT}/__gate`, { signal: AbortSignal.timeout(1500) })
    .then(() => true)
    .catch(() => false);
}

if (flag("--stop")) {
  const pid = existsSync(PID_FILE) ? Number(readFileSync(PID_FILE, "utf8").trim()) : 0;
  if (pid > 0) {
    spawn(process.platform === "win32" ? "taskkill" : "kill",
      process.platform === "win32" ? ["/pid", String(pid), "/T", "/F"] : [String(pid)],
      { stdio: "ignore" });
  }
  rmSync(PID_FILE, { force: true });
  console.log("gate parado.");
  process.exit(0);
}

if (flag("--status")) {
  const running = await alive();
  const pid = existsSync(PID_FILE) ? readFileSync(PID_FILE, "utf8").trim() : "-";
  console.log(`gate 127.0.0.1:${GATE_PORT}: ${running ? "rodando" : "parado"} (pid ${pid})`);
  process.exit(0);
}

if (flag("--start")) {
  if (await alive()) {
    console.log(`gate já está rodando em 127.0.0.1:${GATE_PORT}.`);
    process.exit(0);
  }
  readPassword();
  mkdirSync(path.dirname(PID_FILE), { recursive: true });
  const child = spawn(process.execPath, [runPath(), "--run"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, LXP_GATE_PASSWORD_FILE: PASSWORD_FILE },
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  for (let i = 0; i < 30; i += 1) {
    if (await alive()) {
      console.log(`gate no ar em 127.0.0.1:${GATE_PORT} (pid ${child.pid}).`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.error("gate não subiu a tempo.");
  process.exit(1);
}

password = readPassword();
expected = tokenFor(password);

server.listen(GATE_PORT, "127.0.0.1", () => {
  console.log(`gate no ar: http://127.0.0.1:${GATE_PORT} -> http://127.0.0.1:${APP_PORT}`);
});

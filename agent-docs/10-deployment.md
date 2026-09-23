# Deployment — hybrid Vercel (frontend) + Oracle Cloud (backend)

This file describes the **cloud topology**, the auth/secret model, the container, and every known
limit. The friendly, human-facing walkthrough is `HOSTING.md`; the terse operator checklist is
`DEPLOY.md`. Read `09-app-architecture.md` first for how the app works.

---

## 1. Topology

```
Phone / laptop browser
        │  https://<app>.vercel.app          the ONLY origin the browser resolves
        ▼
Vercel
  ├── static React build (apps/web/dist)
  └── serverless function api/proxy/[...path].ts   (holds TOOLKIT_TOKEN)
        │  https://<host>   Authorization: Bearer <TOOLKIT_TOKEN>
        ▼
Oracle Cloud Always Free VM (Docker, persistent block volume)
  ├── lxp-toolkit-app   Node API + Playwright Chromium + LibreOffice
  ├── lxp-toolkit-db    Postgres 16
  ├── volume lxp-toolkit_pgdata      → /var/lib/postgresql/data
  ├── volume lxp-toolkit_scraped     → /data/scraped   (portal writes; server reads)
  ├── volume lxp-toolkit_serverdata  → /app/apps/server/data
  ├── Caddy (host) → 127.0.0.1:4174 (TLS, SSE flush)
  └── systemd timer → POST /api/refresh (daily)
```

Rationale: the browser only ever talks to `*.vercel.app`, and Vercel reaches the backend. This
keeps the secret out of the client bundle and is friendlier to restrictive college DNS/proxies.

---

## 2. Why the backend cannot run on Vercel

| Need | Where it comes from | Vercel constraint |
|---|---|---|
| Full Chromium + system libs | `packages/portal/src/session.ts`, `submit-task.ts` | bundle limit, no apt/Docker, no display |
| Long scrape jobs (minutes) | `dump`, `dump-surfaces` | function duration (Hobby ~10–60 s) |
| Spawning `npm`/`tsx` children | `refresh.ts`, `send.ts` | serverless cannot spawn the repo toolchain |
| Postgres + migrations + import | `db.ts`, `import.ts` | no bundled DB |
| Persistent `scraped/`, `data/send`, previews | `paths.ts` | read-only FS except ephemeral `/tmp` |
| LibreOffice `soffice` | `office.ts`, `pdf.ts` | not installable |

Only the static UI and the thin proxy are serverless-friendly.

---

## 3. Backend container (`Dockerfile`)

`node:22-bookworm-slim`, plus:

- `libreoffice-core/-writer/-calc/-impress` + `fonts-liberation` + `fonts-dejavu-core` — PDF
  delivery and Office previews (`office.ts`, `pdf.ts`).
- `postgresql-client` — `pg_dump`/`psql` for seeding/backup.
- `curl` + `tini` — cron/health and correct signal handling.
- `npx playwright install --with-deps chromium` with `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
- `npm ci` at the repo root (all workspaces, because the send bridge needs `packages/portal`).
- `CMD npm run start -w @lxp-toolkit/server` — bootstrap applies migrations, imports when the DB is
  empty, and builds the projection.

`EXPOSE 4174`; the web build is **not** included (Vercel serves the UI).

---

## 4. Compose stack (`docker-compose.prod.yml`)

- Project name `lxp-toolkit` → deterministic volume names.
- `db`: `postgres:16-alpine`, `POSTGRES_PASSWORD` from `deploy/.env.prod`, healthcheck, volume
  `lxp-toolkit_pgdata`, internal network only (no host port).
- `app`: builds `Dockerfile`, `depends_on db healthy`, `env_file` =
  `apps/server/.env` + `packages/portal/.env`, and **overrides**:

| Key | Value | Why |
|---|---|---|
| `DATABASE_URL` | `postgres://lxp:<pw>@db:5432/lxp` | container DNS, not localhost |
| `DATA_DIR` | `/data/scraped` | server reads the mounted volume |
| `OUT_DIR` | `/data/scraped` | portal writes the same volume (`resolveOut` honors absolute paths) |
| `PORT` | `4174` | internal port |
| `TOOLKIT_TOKEN` | from `deploy/.env.prod` | enables the auth gate |

- `app` port is bound to **`127.0.0.1:4174`** (loopback) — Caddy terminates TLS in front.
- Volumes: `scraped` (study data + attachments), `serverdata` (send requests, previews,
  `exercises.json`).

> `OUT_DIR`/`DATA_DIR` alignment is the subtle part: the portal writes via
> `packages/portal/src/util.ts::resolveOut` (repo-root relative, but an absolute `OUT_DIR` wins) and
> the server reads via `apps/server/src/paths.ts::dataDir`. Both must point at the same mount.

---

## 5. Frontend (`vercel.json` + `api/proxy/[...path].ts`)

- `installCommand: npm ci`, `buildCommand: npm run build -w @lxp-toolkit/web`,
  `outputDirectory: apps/web/dist`, `framework: null`.
- Rewrites keep the browser on the Vercel origin:

```
/api/:path*      → /api/proxy/api/:path*
/scraped/:path*  → /api/proxy/scraped/:path*
```

- The proxy (`api/proxy/[...path].ts`, Node runtime, `maxDuration: 60`) forwards method, headers and
  body to `BACKEND_URL`, strips hop-by-hop headers, injects `Authorization: Bearer TOOLKIT_TOKEN`,
  and returns `new Response(upstream.body, …)` so **SSE streams through**.
- Env (Production + Preview): `BACKEND_URL`, `TOOLKIT_TOKEN`.
- The frontend code needs **no changes** because it already uses relative `/api` and `/scraped`
  paths (`apps/web/src/api.ts`, `src/lib/files.ts`).

---

## 6. Auth & secret model

- `apps/server/src/auth.ts`: `isAuthorized(req)` compares `TOOLKIT_TOKEN` in constant time.
- Applied to every `/api/*` and `/scraped/**` route; `/api/health` is public.
- `TOOLKIT_TOKEN` unset ⇒ **local mode** (all requests allowed) so dev is unchanged.
- `ALLOWED_ORIGIN` optionally enables CORS + `OPTIONS` for direct browser calls (fallback path).
- The secret lives in exactly three places: `apps/server/.env` (or compose env), `deploy/.env.prod`,
  and the Vercel project env. Rotate all three together.

---

## 7. Seeding

- **A. Fresh scrape on the VM** — run `dump`, `dump-surfaces`, `index`, `index:web` inside the
  `app` container. Simplest; subject to reCAPTCHA from a datacenter IP.
- **B. Copy local data** — `pg_dump` the local DB (port 5434) and copy `scraped/` into the
  `lxp-toolkit_scraped` volume. Preserves answers/overrides/profile. Restore into `db` **before**
  starting `app`, so bootstrap sees existing `content_item` rows and only rebuilds the projection.

---

## 8. Cron / auto-update

- `deploy/refresh.service` (oneshot) + `deploy/refresh.timer` (`OnCalendar=*-*-* 06:00:00`,
  `Persistent=true`, `RandomizedDelaySec=30m`).
- The unit `curl`s `POST http://127.0.0.1:4174/api/refresh` with the bearer token from
  `/etc/lxp-toolkit.env`. `/api/refresh` returns immediately; progress is in `/api/refresh/status`.
- Concurrency is guarded by `refresh.ts` (a second `start()` while running returns `false`), so the
  timer and the **Atualizar** button never overlap.

---

## 9. TLS without a domain

- **sslip.io**: `<PUBLIC_IP>.sslip.io` resolves to the IP. Point the Caddyfile at it; Caddy obtains
  a Let's Encrypt cert via HTTP-01 (requires ports 80 + 443 open in the VCN **and** the OS
  `iptables`). `BACKEND_URL = https://<PUBLIC_IP>.sslip.io`.
- **Cloudflare Tunnel** (alternative): `cloudflared` dials out and exposes a `trycloudflare.com`
  hostname; no inbound ports needed, but adds a dependency and an extra hop.

---

## 10. Failure modes & mitigations

| Failure | Cause | Mitigation |
|---|---|---|
| reCAPTCHA on scrape/send | login from a datacenter IP; headless can't show the window | scrape from home occasionally, configure a residential proxy for Playwright, or keep sends local |
| `413` / truncated uploads | Vercel function request body limit ~4.5 MB | keep files small or upload on the VM; core JSON flows are far below |
| AI stream timeout | `maxDuration: 60` (Hobby) on long generations | retry, shorten, or (fallback) call the SSE endpoints directly with `ALLOWED_ORIGIN` set |
| `502` from the proxy | wrong `BACKEND_URL`, backend down, or TLS not ready | check `/api/health` directly on the VM, then via the public host |
| `401` in the browser | Vercel `TOOLKIT_TOKEN` ≠ backend | fix env, redeploy Vercel, restart compose |
| Oracle account suspended | account idle ≥ 30 days | the daily timer keeps the VM active |
| College blocks everything | no external network at all | use the local fallback (`SKIP_SYNC=1 npm run dev`) |
| Postgres connection refused | `db` not healthy or wrong password | `docker compose logs db`; verify `POSTGRES_PASSWORD` in both places |

---

## 11. Security model

- Expose only **22/80/443**; backend port is loopback-only.
- Strong `TOOLKIT_TOKEN`; `/etc/lxp-toolkit.env` at `chmod 600`.
- Portal credentials + OpenAI key live only in the VM's env files (gitignored). The browser never
  receives portal credentials; sends are spawned server-side.
- `scraped/` is personal data; keep it on the volume and out of git.
- Backups: `pg_dump` for the DB and a tarball/copy of the `scraped` volume.

---

## 12. Offline fallback (local-first)

After one sync done at home, the app runs with no internet:

```bash
npm run db:up
SKIP_SYNC=1 npm run dev     # http://localhost:5174 — reads local Postgres + scraped/
```

Only AI generation, the scrape/refresh, portal sends, Office previews, and external avatar/CDN
links need internet.

---

## 13. Deploy verification checklist

1. `docker compose -f docker-compose.prod.yml config` → valid.
2. On the VM: `curl -s http://127.0.0.1:4174/api/health` → `{"ok":true}`.
3. On the VM: `/api/exercises` without token → `401`.
4. Public host: `curl -s https://<host>/api/health` → `{"ok":true}`.
5. Vercel: `https://<app>.vercel.app/api/health` → `{"ok":true}`.
6. Browser: task list loads; open an activity; generate a draft; hit **Atualizar**.
7. Timer: `systemctl list-timers refresh.timer` shows the next run.

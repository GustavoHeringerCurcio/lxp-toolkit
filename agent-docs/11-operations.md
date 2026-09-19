# Operations — running, debugging and maintaining LXP Toolkit

Day-2 runbook for both the **local** setup and the **cloud** deployment. For how the pieces work,
see `09-app-architecture.md`; for the topology and limits, `10-deployment.md`.

---

## 1. Command cheat-sheet

### Local (repo root)

| Goal | Command |
|---|---|
| Onboard | `npm run setup` |
| Health check | `npm run doctor` |
| Start DB | `npm run db:up` |
| Migrate | `npm run db:migrate` |
| Scrape content | `npm run dump` |
| Scrape surfaces | `npm run dump-surfaces` |
| Rebuild portal homework index | `npm run index` |
| Rebuild UI cache (`migrate→import→project`) | `npm run index:web` |
| Full refresh (DB→scrape→index) | `npm run sync` |
| Dev (API + Vite, no scrape) | `npm run dev` |
| Dev with fresh scrape | `npm run dev:fresh` |
| Production-style (build + serve) | `npm run web` |
| Typecheck / tests / build | `npm run typecheck` / `npm test` / `npm run build` |

### Cloud (on the VM, repo root)

Use `COMPOSE="docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod"` for brevity.

| Goal | Command |
|---|---|
| Start / rebuild | `$COMPOSE up -d --build` |
| Logs | `$COMPOSE logs -f app` |
| Stop | `$COMPOSE down` |
| Run a portal command | `$COMPOSE exec -T app npm run dump` |
| Reindex | `$COMPOSE exec -T app npm run index:web` |
| DB shell | `$COMPOSE exec db psql -U lxp -d lxp` |
| Health (VM) | `curl -s http://127.0.0.1:4174/api/health` |
| Health (public) | `curl -s https://<host>/api/health` |
| Cron status | `systemctl list-timers refresh.timer` |

---

## 2. Refresh semantics

The pipeline is `dump → dump-surfaces → index → index:web` (plus Docker/migrations in `sync.mjs`).
It runs from: `npm run sync`, `dev:fresh`, `web`'s `preweb`, the app's **Atualizar** button
(`POST /api/refresh`), and the systemd timer.

Escape hatches:

| Flag | Effect |
|---|---|
| `SKIP_SYNC=1` | skip the whole refresh (boot with existing data) |
| `SKIP_DB=1` | assume Postgres is already up |
| `SKIP_DUMP=1` | skip the scrape; rebuild indexes only |
| `SKIP_HARVEST=1` | skip the hidden-topic sweep |

`refresh.ts` refuses a concurrent run; the timer and the button cannot overlap. Progress lives in
`GET /api/refresh/status` (`running`, `step`, `error`, `log`).

---

## 3. Health & diagnostics

- `npm run doctor` — Node, deps, Chromium launch, portal creds, OpenAI key (+source), Postgres
  reachability, Docker, scraped content, LibreOffice, ports 4174/5174, PII guard.
- `GET /api/health` — `{ ok, time }`; public; use for uptime checks and to confirm the proxy path.
- `GET /api/debug-logs` / `GET /api/debug-log/:id` — quality-gate failures with full context.
- App logs: `$COMPOSE logs -f app`. Caddy logs: `journalctl -u caddy -f`.

---

## 4. Backup & restore

### Database

```bash
# Backup
$COMPOSE exec -T db pg_dump -U lxp -d lxp --no-owner --no-acl > lxp-$(date +%F).dump
# Restore (fresh DB)
$COMPOSE exec -T db psql -U lxp -d lxp < lxp-YYYY-MM-DD.dump
```

### Scraped data + server data

```bash
docker run --rm -v lxp-toolkit_scraped:/data -v "$PWD/backup":/out alpine \
  sh -c 'cd /data && tar czf /out/scraped.tgz .'
docker run --rm -v lxp-toolkit_serverdata:/data -v "$PWD/backup":/out alpine \
  sh -c 'cd /data && tar czf /out/serverdata.tgz .'
```

Restore by reversing the volume mount and extracting into `/data`.

---

## 5. Upgrade & rollback

```bash
# Upgrade
cd ~/lxp-toolkit && git pull
$COMPOSE up -d --build          # rebuilds the image; bootstrap re-applies migrations

# Rollback (image)
git checkout <previous-sha>
$COMPOSE up -d --build
```

Migrations are forward-only. Restore a DB dump if a migration must be undone. The frontend
redeploys automatically on `git push` (Vercel).

---

## 6. Rotate `TOOLKIT_TOKEN`

1. Generate: `openssl rand -hex 32`.
2. `apps/server/.env` (or `deploy/.env.prod`) on the VM → update and `$COMPOSE up -d app`.
3. `deploy/.env.prod` → update (used by compose substitution) and restart.
4. Vercel → Settings → Environment Variables → update `TOOLKIT_TOKEN` → **Redeploy**.
5. `/etc/lxp-toolkit.env` on the VM (used by the cron unit) → update, then
   `sudo systemctl restart refresh.timer`.

---

## 7. Debugging the proxy / SSE

```bash
# Backend direct (bypasses Vercel)
curl -s -H "Authorization: Bearer $TOOLKIT_TOKEN" https://<host>/api/exercises | head -c 200
# Through Vercel
curl -s https://<app>.vercel.app/api/health
# SSE through the proxy (should stream, not buffer)
curl -N -X POST https://<app>.vercel.app/api/training/study \
  -H 'content-type: application/json' -d '{"courseId":<id>,"query":"resumo"}'
```

If SSE buffers or times out, the fallback is to set `ALLOWED_ORIGIN` on the backend and call the two
SSE endpoints directly from the browser (requires exposing a scoped token), or move to Vercel Pro.

---

## 8. Re-seed / reindex

- **Reindex only** (cache stale, no re-scrape): `$COMPOSE exec -T app npm run index:web`.
- **Re-import** (content changed on disk): `$COMPOSE exec -T app npm run db:import` then `index:web`.
- **Full fresh scrape**: `$COMPOSE exec -T app npm run dump && … dump-surfaces && … index && … index:web`.
- **Reset the DB**: `$COMPOSE down -v` deletes the `pgdata` volume (destroys answers/profile) —
  use with care, then `up -d --build`.

---

## 9. Data locations

| Path | Contents |
|---|---|
| volume `lxp-toolkit_pgdata` | Postgres data (source of truth) |
| volume `lxp-toolkit_scraped` (`/data/scraped`) | portal scrape output, attachments |
| volume `lxp-toolkit_serverdata` (`/app/apps/server/data`) | `exercises.json`, `send/`, `previews/` |
| `apps/server/.env`, `packages/portal/.env` | runtime secrets (VM) |
| `deploy/.env.prod` | compose substitution secrets |
| `/etc/lxp-toolkit.env` | `TOOLKIT_TOKEN` for the cron unit |
| `/etc/caddy/Caddyfile` | TLS reverse proxy |

---

## 10. Common failures

| Symptom | First checks |
|---|---|
| App 502 via Vercel | `BACKEND_URL` correct? backend `/api/health` up? Caddy cert issued? |
| 401 everywhere | token mismatch (Vercel vs backend vs cron env) |
| Empty task list | did `dump` + `index:web` run? `content_item` count > 0? |
| Scrape fails with reCAPTCHA | scrape from home (`HEADFUL=true npm run dump`) or proxy |
| PDF/preview unavailable | LibreOffice missing in the image, or `SOFFICE_BIN` wrong |
| Send returns 503 | `sendEnv()` failed — Playwright/`tsx`/runner missing in the container |
| AI errors | `OPENAI_API_KEY` missing/invalid; model roles in `ai_config` |
| Port 4174 busy locally | set `PORT` in `apps/server/.env` |
| Postgres not reachable | `$COMPOSE logs db`; `DATABASE_URL`/`POSTGRES_PASSWORD` mismatch |

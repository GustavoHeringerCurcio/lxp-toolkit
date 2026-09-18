# Deploying LXP Toolkit — Vercel frontend + Oracle Cloud backend

Split deployment so the app is reachable from a phone / the college network while
the heavy work (Playwright scrape, LibreOffice, Postgres) runs on a free VM:

```
Phone / laptop browser
        │  https://<app>.vercel.app        (the only origin the browser talks to)
        ▼
Vercel: static React build  +  /api/* & /scraped/* proxy function (holds the secret)
        │  https://api.<your-domain>       (Authorization: Bearer TOOLKIT_TOKEN)
        ▼
Oracle Cloud Always Free VM (Docker)
  ├── lxp-toolkit-app   Node API + refresh + submit runner
  │                     image: Chromium + LibreOffice + fonts
  ├── lxp-toolkit-db    Postgres 16 (volume lxp-toolkit_pgdata)
  ├── volumes           lxp-toolkit_scraped → /data/scraped
  │                     lxp-toolkit_serverdata → /app/apps/server/data
  └── systemd timer → POST /api/refresh   (daily scrape)
```

Why the proxy: the browser only resolves `*.vercel.app`, and Vercel's servers
reach the backend. That keeps the shared secret out of the client bundle and
works better on restrictive college DNS/proxies.

> The backend needs **Chromium + LibreOffice + Postgres + long-running jobs**, so
> it cannot run on Vercel serverless. Only the static UI and the thin proxy do.

---

## 0. Generate the shared secret

```bash
openssl rand -hex 32
```

Use the same value for `TOOLKIT_TOKEN` in **three** places:
`apps/server/.env`, `deploy/.env.prod`, and the Vercel project env.

---

## 1. Provision the Oracle Always Free VM

1. Create an **Always Free** account (a credit/debit card is required for identity
   verification only; Always Free resources are not charged).
2. Create an instance: **Ampere A1 (Arm)**, Ubuntu 24.04, 2–4 OCPU / 12–24 GB,
   and attach a block volume (100 GB is plenty). If Arm capacity is unavailable,
   try another availability domain or region.
3. In the **VCN security list**, allow ingress TCP **22, 80, 443**.
4. SSH in and install Docker + Compose, then set the timezone:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER" && newgrp docker
sudo timedatectl set-timezone America/Sao_Paulo
```

Optional hardening: `sudo apt-get install -y ufw && sudo ufw allow 22,80,443/tcp && sudo ufw enable`.

---

## 2. Put the code and secrets on the VM

```bash
git clone <your-repo-url> lxp-toolkit && cd lxp-toolkit
```

Create the gitignored env files (copy the examples, then fill them in):

| File | Keys |
|---|---|
| `packages/portal/.env` | `LXP_USERNAME`, `LXP_PASSWORD` (from `.env.example`) |
| `apps/server/.env` | `OPENAI_API_KEY`, `TOOLKIT_TOKEN`, `DATABASE_URL` (any value here; compose overrides it) |
| `deploy/.env.prod` | `POSTGRES_PASSWORD`, `TOOLKIT_TOKEN` (from `.env.prod.example`) |

`DATABASE_URL` and `DATA_DIR` are overridden by `docker-compose.prod.yml`, so the
values in `apps/server/.env` only matter for running outside Docker.

---

## 3. Seed the database and scraped data

Pick **A** (fresh scrape on the VM) or **B** (copy your existing data).

### A. Fresh scrape on the VM

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f docker-compose.prod.yml exec -T app npm run dump
docker compose -f docker-compose.prod.yml exec -T app npm run dump-surfaces
docker compose -f docker-compose.prod.yml exec -T app npm run index
docker compose -f docker-compose.prod.yml exec -T app npm run index:web
```

> If the portal shows a reCAPTCHA, the headless run fails. Solve it by scraping
> from home first, or configure a residential proxy (see Risks).

### B. Copy your local data

On the **laptop** (local dev DB runs on port 5433 via `docker-compose.yml`):

```bash
docker compose exec -T db pg_dump -U lxp -d lxp --no-owner --no-acl > lxp.dump
tar czf scraped.tgz scraped
scp lxp.dump scraped.tgz user@<vm-ip>:~/lxp-toolkit/
```

On the **VM**:

```bash
cd ~/lxp-toolkit
# 1. Start only the database, then restore into it.
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d db
docker compose -f docker-compose.prod.yml exec -T db psql -U lxp -d lxp < lxp.dump

# 2. Create the scraped volume and copy your files in.
docker volume create lxp-toolkit_scraped
tar xzf scraped.tgz
docker run --rm -v lxp-toolkit_scraped:/data -v "$PWD/scraped":/src alpine sh -c 'cp -a /src/. /data/'
```

Then start the app (Step 4). Its bootstrap imports the catalog only when the DB
is empty, so an existing dump is preserved and the UI cache is rebuilt from it.

---

## 4. Build and start

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f docker-compose.prod.yml logs -f app
```

Verify locally on the VM:

```bash
curl -s http://127.0.0.1:4174/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4174/api/exercises   # expect 401 without token
```

---

## 5. TLS (Caddy)

Point a DNS **A record** for `api.<your-domain>` at the VM's public IP, then:

```bash
sudo apt-get install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the hostname first
sudo systemctl reload caddy
curl -s https://api.<your-domain>/api/health
```

Caddy fetches a Let's Encrypt certificate automatically (ports 80/443 must be open).

---

## 6. Deploy the frontend on Vercel

1. Push this repo to GitHub, then **Vercel → Add New → Project → Import** it.
2. Leave the **Root Directory** as the repo root. `vercel.json` already sets the
   install/build/output commands for the npm workspace and the proxy rewrites.
3. Add environment variables (Production + Preview):

| Name | Value |
|---|---|
| `BACKEND_URL` | `https://api.<your-domain>` (no trailing slash) |
| `TOOLKIT_TOKEN` | the same secret from Step 0 |

4. **Deploy**, then open the Vercel URL: the task list should load through the
   proxy. Check `https://<app>.vercel.app/api/health`.

> Vercel Hobby is for personal, non-commercial use — this is a personal tool.

---

## 7. Daily automatic refresh (cron)

On the VM:

```bash
echo 'TOOLKIT_TOKEN=<same secret>' | sudo tee /etc/lxp-toolkit.env
sudo chmod 600 /etc/lxp-toolkit.env
sudo cp deploy/refresh.service deploy/refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now refresh.timer
systemctl list-timers refresh.timer
```

The timer runs at 06:00 (server time), and once shortly after boot if it missed
the window. The same pipeline runs from the app's **Atualizar** button; the two
never overlap (the refresh controller refuses a concurrent run).

---

## 8. Updating the code

```bash
# Backend (VM)
cd ~/lxp-toolkit && git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build

# Frontend: push to GitHub — Vercel redeploys automatically.
```

`npm run typecheck` and `npm test` run in CI (`.github/workflows/ci.yml`).

---

## Risks and limitations

- **reCAPTCHA from a datacenter IP.** Oracle's IP is more likely to trigger it,
  and a headless server cannot show the solve window. Mitigations: run the
  scrape occasionally from home, configure a residential proxy for Playwright, or
  accept manual scrapes. Reads (the app UI) are unaffected.
- **Vercel request body limit (4.5 MB).** Uploading project-source files
  (`/api/project-source/file`, 25 MB) or screenshots (`/api/send/upload`, 10 MB)
  through the proxy will fail above ~4.5 MB. Keep those files small, or upload
  them directly on the VM. AI/answer/exercise JSON is far below the limit.
- **Serverless duration (Hobby).** The proxy sets `maxDuration: 60`. Very long AI
  streams (`/api/answer/stream`, `/api/training/study`) may exceed it. Fallback:
  set `ALLOWED_ORIGIN` on the backend and call those two endpoints directly from
  the browser (requires exposing a scoped token), or use Vercel Pro.
- **Oracle idle policy.** Accounts idle for 30 days can be suspended; the daily
  timer keeps the VM active.
- **Credentials on the VM.** `LXP_USERNAME`/`LXP_PASSWORD` and `OPENAI_API_KEY`
  live in the VM's env files. Restrict SSH, keep only 22/80/443 open, and never
  commit those files.
- **Fully offline college network.** If everything external is blocked, neither
  Vercel nor the backend is reachable. Keep the local path as a fallback:
  `SKIP_SYNC=1 npm run dev` after a sync done at home.

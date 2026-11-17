/**
 * The public URL that reaches this app (Tailscale Serve/Funnel).
 *
 * The header logo opens it so a localhost session can hop to the same app from
 * another device. Sources, highest priority first:
 *
 *   1. `LXP_PUBLIC_URL` — explicit override for a stable domain.
 *   2. The last `*.ts.net` origin a browser used to open the app. This works
 *      inside the container (which has no `tailscale` CLI) and survives restarts
 *      because it is stored under the mounted `apps/server/data`.
 *   3. `tailscale status --json` — for host runs where the CLI is on PATH.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic.js";
import { assist } from "./paths.js";

export type AppLinkSource = "env" | "reported" | "tailscale";

export interface AppLink {
  url: string | null;
  source: AppLinkSource | null;
}

const storeFile = (): string => assist("data", "app-link.json");
const CLI_TTL_MS = 5 * 60_000;
let cliCache: { url: string | null; at: number } | null = null;

/** Normalize any URL-ish string to a bare origin, or null when unusable. */
function originOf(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readReported(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(storeFile(), "utf-8")) as { url?: unknown };
    return originOf(parsed?.url);
  } catch {
    return null;
  }
}

/**
 * Bare origin for a `*.ts.net` URL, or null. Only Tailscale names are accepted
 * so a stray host header can't poison the link.
 */
export function tailnetOrigin(raw: unknown): string | null {
  const url = originOf(raw);
  if (!url) return null;
  return new URL(url).hostname.endsWith(".ts.net") ? url : null;
}

/** Remember the origin a browser used to reach the app over the tailnet. */
export function rememberAppUrl(raw: unknown): string | null {
  const url = tailnetOrigin(raw);
  if (!url) return null;
  const file = storeFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify({ url, updatedAt: new Date().toISOString() }, null, 2));
  return url;
}

/** Best-effort detection from the Tailscale CLI (host runs only). */
function detectTailscale(): string | null {
  const now = Date.now();
  if (cliCache && now - cliCache.at < CLI_TTL_MS) return cliCache.url;

  let url: string | null = null;
  try {
    const res = spawnSync("tailscale", ["status", "--json"], {
      encoding: "utf-8",
      timeout: 2000,
    });
    if (!res.error && res.status === 0 && res.stdout) {
      const self = (JSON.parse(res.stdout) as { Self?: { DNSName?: string } }).Self;
      const dns = (self?.DNSName ?? "").replace(/\.$/, "");
      if (dns) url = `https://${dns}`;
    }
  } catch {
    // No CLI (the container) or unparsable output: other sources still apply.
  }

  cliCache = { url, at: now };
  return url;
}

export function getAppLink(): AppLink {
  const fromEnv = originOf(process.env.LXP_PUBLIC_URL);
  if (fromEnv) return { url: fromEnv, source: "env" };

  const reported = readReported();
  if (reported) return { url: reported, source: "reported" };

  const detected = detectTailscale();
  if (detected) return { url: detected, source: "tailscale" };

  return { url: null, source: null };
}

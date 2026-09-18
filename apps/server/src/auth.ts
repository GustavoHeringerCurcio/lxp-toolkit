import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Shared-secret gate for the backend API.
 *
 * The backend runs on a public host (behind the Vercel proxy), so every
 * `/api/*` and `/scraped/**` request must prove it comes from the proxy. The
 * secret lives only in the backend env and in the Vercel project env — it is
 * never shipped to the browser.
 *
 * When `TOOLKIT_TOKEN` is unset the server is treated as local-only (the
 * default dev experience) and every request is allowed.
 */
export function toolkitToken(): string {
  return (process.env.TOOLKIT_TOKEN ?? "").trim();
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Extract the presented token from `Authorization: Bearer` or `x-toolkit-token`. */
export function presentedToken(req: IncomingMessage): string {
  const header = req.headers["authorization"];
  if (typeof header === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1].trim();
  }
  const custom = req.headers["x-toolkit-token"];
  if (typeof custom === "string") return custom.trim();
  return "";
}

/**
 * True when the request may proceed: either no secret is configured (local
 * mode) or the presented token matches it.
 */
export function isAuthorized(req: IncomingMessage): boolean {
  const expected = toolkitToken();
  if (!expected) return true;
  return safeEqual(presentedToken(req), expected);
}

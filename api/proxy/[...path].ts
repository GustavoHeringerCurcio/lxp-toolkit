/**
 * Vercel proxy: the browser only ever talks to the Vercel origin, and this
 * function forwards `/api/*` and `/scraped/*` to the private backend, adding
 * the shared secret server-side. That keeps the token out of the client bundle
 * and lets restrictive college networks reach the backend through Vercel.
 *
 * `vercel.json` rewrites:
 *   /api/:path*     → /api/proxy/api/:path*
 *   /scraped/:path* → /api/proxy/scraped/:path*
 *
 * so the forwarded path here already carries the `api/` or `scraped/` prefix.
 *
 * Env (Vercel project settings):
 *   BACKEND_URL    https://api.example.com   (no trailing slash)
 *   TOOLKIT_TOKEN  same secret as the backend
 */

export const config = { runtime: "nodejs" };

/** Headers that must not be forwarded verbatim between hops. */
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "transfer-encoding",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "upgrade",
]);

function backendUrl(): string {
  return (process.env.BACKEND_URL ?? "").trim().replace(/\/+$/, "");
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const base = backendUrl();
  if (!base) return jsonError(500, "BACKEND_URL não configurada no projeto Vercel.");

  const incoming = new URL(req.url);
  // /api/proxy/api/exercises → /api/exercises ; /api/proxy/scraped/a.pdf → /scraped/a.pdf
  const forwardedPath = incoming.pathname.replace(/^\/api\/proxy/, "") || "/";
  const target = `${base}${forwardedPath}${incoming.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  const token = (process.env.TOOLKIT_TOKEN ?? "").trim();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch (err) {
    return jsonError(502, `backend inacessível: ${err instanceof Error ? err.message : String(err)}`);
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  // Stream the body straight through so SSE (`/api/answer/stream`,
  // `/api/training/study`) keeps working.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

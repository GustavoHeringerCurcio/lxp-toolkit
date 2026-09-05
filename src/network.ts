import type { Page } from "playwright";
import { logger } from "./config.js";

export interface CapturedRequest {
  id: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: string;
}

export interface CapturedResponse {
  id: number;
  requestId: number | null;
  url: string;
  status: number;
  headers: Record<string, string>;
  body?: string;
  timestamp: string;
}

export interface NetworkCapture {
  requests: CapturedRequest[];
  responses: CapturedResponse[];
}

const INTERESTING_HOSTS = [
  "api.plataforma.grupoa.education",
  "grupoa.education",
  "lyceum.com.br",
  "static.plataforma.grupoa.education",
];

/** Redact credentials from captured request headers (bearer token, cookies). */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /authorization|cookie/i.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

/** Whether a URL is worth recording (API / platform / static asset calls). */
export function isInterestingUrl(url: string): boolean {
  if (url.startsWith("data:")) return false;
  if (/\.(png|jpg|jpeg|gif|webp|svg|woff2?|css)$/i.test(url)) return false;
  return INTERESTING_HOSTS.some((host) => url.includes(host));
}

/**
 * Records every interesting network request/response on a page so the API surface
 * can be reverse-engineered. Attach before navigating; export via `.dump()`.
 */
export class NetworkRecorder {
  readonly requests: CapturedRequest[] = [];
  readonly responses: CapturedResponse[] = [];
  private nextId = 1;
  private readonly requestIndex = new Map<string, number>();

  constructor(private readonly page: Page) {
    page.on("request", (req) => {
      if (!isInterestingUrl(req.url())) return;
      const id = this.nextId++;
      const key = `${req.method()} ${req.url()}`;
      this.requestIndex.set(key, id);
      this.requests.push({
        id,
        method: req.method(),
        url: req.url(),
        headers: redactHeaders(req.headers()),
        postData: req.postData() ?? undefined,
        timestamp: new Date().toISOString(),
      });
    });

    page.on("response", async (res) => {
      if (!isInterestingUrl(res.url())) return;
      const id = this.nextId++;
      const requestId = this.requestIndex.get(`${res.request().method()} ${res.url()}`) ?? null;
      let body: string | undefined;
      const contentType = res.headers()["content-type"] ?? "";
      if (/json|text|xml|html|javascript/i.test(contentType)) {
        try {
          body = await res.text();
          if (body.length > 200_000) body = body.slice(0, 200_000) + "\n…[truncated]";
        } catch {
          /* body unavailable */
        }
      }
      this.responses.push({
        id,
        requestId,
        url: res.url(),
        status: res.status(),
        headers: res.headers(),
        body,
        timestamp: new Date().toISOString(),
      });
    });
  }

  dump(): NetworkCapture {
    return { requests: this.requests, responses: this.responses };
  }

  logSummary(): void {
    const api = this.requests.filter((r) => r.url.includes("api.plataforma.grupoa.education"));
    const methods = new Map<string, number>();
    for (const r of api) methods.set(r.method, (methods.get(r.method) ?? 0) + 1);
    logger.info({ apiCalls: api.length, methods: Object.fromEntries(methods) }, "network summary");
  }
}

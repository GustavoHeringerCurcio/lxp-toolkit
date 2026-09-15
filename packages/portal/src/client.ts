import { config, logger } from "./config.js";
import { sleep } from "./util.js";

export interface ApiHeaders {
  authorization: string;
  accept: string;
  "x-user-timezone": string;
  "x-notice-show-modal"?: string;
  "x-notice-signature"?: string;
  "x-notice-expired-at"?: string;
}

export interface NoticeToken {
  signature?: string;
  expiredAt?: string | number;
}

export interface ApiClientOptions {
  token: string;
  notice?: NoticeToken;
  base?: string;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

/** Abort a stalled portal request so a single hung socket can't freeze a run. */
const REQUEST_TIMEOUT_MS = 30_000;

export class ApiClient {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(options: ApiClientOptions) {
    this.base = options.base ?? config.apiBase;
    const headers: Record<string, string> = {
      authorization: options.token,
      accept: "application/json",
      "x-user-timezone": config.tz,
      "x-notice-show-modal": "false",
    };
    if (options.notice?.signature) {
      headers["x-notice-signature"] = options.notice.signature;
    }
    if (options.notice?.expiredAt != null) {
      headers["x-notice-expired-at"] = String(options.notice.expiredAt);
    }
    this.headers = headers;
  }

  static headersFor(token: string, notice?: NoticeToken): ApiHeaders {
    const h: ApiHeaders = {
      authorization: token,
      accept: "application/json",
      "x-user-timezone": config.tz,
      "x-notice-show-modal": "false",
    };
    if (notice?.signature) h["x-notice-signature"] = notice.signature;
    if (notice?.expiredAt != null) h["x-notice-expired-at"] = String(notice.expiredAt);
    return h;
  }

  private async request<T>(path: string, init?: RequestInit, attempts = 4): Promise<ApiResponse<T>> {
    const url = this.base + path;
    let lastErr: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            ...this.headers,
            ...(init?.headers ?? {}),
          },
          signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) {
          const text = await res.text();
          const data = (text ? JSON.parse(text) : null) as T;
          return { status: res.status, data };
        }
        lastErr = new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}`);
        if (res.status === 403 || res.status === 429 || res.status >= 500) {
          logger.warn({ path, status: res.status }, "retryable API error, backing off");
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw lastErr;
      } catch (err) {
        lastErr = err;
        if (err instanceof Error && !err.message.includes("->")) throw err;
        await sleep(500 * 2 ** attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  get<T>(path: string, attempts = 4): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: "GET" }, attempts);
  }

  post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }
}

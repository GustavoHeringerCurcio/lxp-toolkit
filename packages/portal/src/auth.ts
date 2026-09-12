import type { BrowserContext, BrowserContextOptions, Page } from "playwright";
import { config, logger } from "./config.js";
import { hasStorageState, storageStatePath } from "./util.js";
import { readFileSync } from "node:fs";
import type { NoticeToken } from "./client.js";

export class CaptchaRequiredError extends Error {
  constructor() {
    super("reCAPTCHA challenge detected; automated login is not possible");
    this.name = "CaptchaRequiredError";
  }
}

export interface AuthSession {
  token: string;
  notice: NoticeToken;
  lxpUrl: string;
}

async function waitForUrl(page: Page, predicate: (url: string) => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate(page.url())) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function fillAndSubmit(page: Page): Promise<void> {
  await page.fill("#username", config.lxpUsername);
  await page.fill("#password", config.lxpPassword);
  await page.locator("form button[type=submit]").first().click();
}

export async function loginToLyceum(
  page: Page,
  onCaptcha?: () => Promise<void>,
): Promise<void> {
  const loginUrl = config.lxpLoginUrl;
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#username").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1_000);

  const captchaPresent = async () => (await page.locator("#g-recaptcha iframe").count()) > 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await captchaPresent()) {
      if (onCaptcha) {
        await onCaptcha();
      } else {
        throw new CaptchaRequiredError();
      }
    }
    await fillAndSubmit(page);
    if (await waitForUrl(page, (u) => !u.includes("#/login"), 25_000)) {
      logger.info({ attempt }, "lyceum login succeeded");
      return;
    }
    logger.warn({ attempt, url: page.url() }, "lyceum login did not reach home, retrying");
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await page.locator("#username").waitFor({ state: "visible", timeout: 30_000 });
  }

  throw new Error("lyceum login failed after 3 attempts");
}

function findLxpUrl(node: unknown, host: string): string | null {
  if (typeof node === "string") {
    if (node.includes(host) || node.includes("plataforma")) {
      try {
        return new URL(node).href;
      } catch {
        /* not a standalone URL */
      }
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const value of node) {
      const found = findLxpUrl(value, host);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = findLxpUrl(value, host);
      if (found) return found;
    }
  }
  return null;
}

/** Read the LXP deep-link URL straight from the Lyceum nav menu (`ngStorage-menu`). */
async function extractLxpMenuUrl(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("ngStorage-menu");
      if (!raw) return null;
      const menu = JSON.parse(raw);
      const visit = (nodes: unknown[]): string | null => {
        for (const node of nodes as { name?: string; url?: string; itens?: unknown[] }[]) {
          if (!node) continue;
          if ((node.name ?? "").toLowerCase() === "lxp" && typeof node.url === "string" && node.url) {
            return node.url;
          }
          if (node.itens) {
            const found = visit(node.itens);
            if (found) return found;
          }
        }
        return null;
      };
      if (Array.isArray(menu)) return visit(menu);
      return null;
    } catch {
      return null;
    }
  });
}

async function extractLxpUrl(page: Page, timeoutMs = 20_000): Promise<string | null> {
  const host = new URL(config.lxpUrl).hostname;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const menuUrl = await extractLxpMenuUrl(page);
    if (menuUrl) return menuUrl;

    const rawValues = await page.evaluate(() => {
      const g = globalThis as unknown as {
        sessionStorage: { length: number; key(i: number): string | null; getItem(k: string): string | null };
        localStorage: { length: number; key(i: number): string | null; getItem(k: string): string | null };
      };
      const entries: string[] = [];
      for (const store of [g.sessionStorage, g.localStorage]) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key) entries.push(store.getItem(key) ?? "");
        }
      }
      return entries;
    });

    for (const raw of rawValues) {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const found = findLxpUrl(data, host);
      if (found) return found;
    }

    await page.waitForTimeout(500);
  }

  return null;
}

async function openLxpCalendar(context: BrowserContext, page: Page): Promise<Page> {
  const link = page.locator("a.new_navigation-item--link", { hasText: "LXP" }).filter({ visible: true }).first();
  await link.waitFor({ state: "visible", timeout: 30_000 });

  const [popup] = await Promise.all([
    context.waitForEvent("page", { timeout: 30_000 }),
    link.click(),
  ]);

  await popup.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  return popup;
}

/**
 * The LXP SPA first writes the raw SSO `tokenId` (from the `?tokenId=` query param)
 * into `localStorage["plataforma_accessToken"]`, then exchanges it for a real session
 * token a moment later. Using the raw tokenId against the academic/content API yields
 * `safea-client-403_token-expired`. This waits until the exchanged token appears.
 */
async function waitForExchangedToken(page: Page, lxpUrl: string, timeoutMs = 30_000): Promise<string | null> {
  let tokenId = "";
  try {
    tokenId = new URL(lxpUrl).searchParams.get("tokenId") ?? "";
  } catch {
    /* lxpUrl may be relative; fall back to "" and just require any token */
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const token = await page
      .evaluate(() => {
        const ls = (globalThis as unknown as { localStorage: { getItem(k: string): string | null } }).localStorage;
        return ls.getItem("plataforma_accessToken");
      })
      .catch(() => null);
    if (token && (!tokenId || token !== tokenId)) return token;
    await page.waitForTimeout(500);
  }
  return null;
}

/**
 * Performs a fresh credential login: Lyceum SSO → LXP platform.
 * Returns the page landed on the LXP platform (with the token in localStorage).
 * Throws CaptchaRequiredError if a reCAPTCHA blocks automated login (unless onCaptcha is provided).
 */
export async function authenticate(
  context: BrowserContext,
  page: Page,
  options: { forceLogin?: boolean; onCaptcha?: () => Promise<void> } = {},
): Promise<Page> {
  await loginToLyceum(page, options.onCaptcha);

  const lxpUrl = await extractLxpUrl(page);
  if (lxpUrl) {
    await page.goto(lxpUrl, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    const exchanged = await waitForExchangedToken(page, lxpUrl);
    if (exchanged) {
      logger.info({ token: "acquired" }, "lxp token exchanged");
      return page;
    }
  }

  const calendar = await openLxpCalendar(context, page);
  await page.close().catch(() => {});
  return calendar;
}

/** Reads the platform access token + notice token from the LXP page's localStorage. */
export async function readToken(page: Page, timeoutMs = 30_000): Promise<AuthSession | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = await page
      .evaluate(() => {
        const ls = (globalThis as unknown as { localStorage: { getItem(k: string): string | null } }).localStorage;
        const token = ls.getItem("plataforma_accessToken");
        if (!token) return null;
        let notice: NoticeToken = {};
        try {
          notice = JSON.parse(ls.getItem("plataforma_noticeToken") || "{}") as NoticeToken;
        } catch {
          notice = {};
        }
        return { token, notice, lxpUrl: globalThis.location?.href ?? "" };
      })
      .catch(() => null);

    if (session?.token) return session;
    await page.waitForTimeout(500);
  }
  return null;
}

/** Saves the current browser session state for reuse across runs. */
export async function saveSession(context: BrowserContext): Promise<void> {
  const state = await context.storageState();
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const path = storageStatePath();
  const dir = path.replace(/\/storageState\.json$/, "");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
  logger.info({ path }, "session state saved");
}

type StorageState = NonNullable<BrowserContextOptions["storageState"]>;

export function loadStorageStateJson(): StorageState | undefined {
  if (!hasStorageState()) return undefined;
  try {
    return JSON.parse(readFileSync(storageStatePath(), "utf-8")) as StorageState;
  } catch {
    return undefined;
  }
}

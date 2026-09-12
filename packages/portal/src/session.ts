import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { authenticate, readToken, type AuthSession } from "./auth.js";
import { ApiClient } from "./client.js";
import { config, hasCredentials, logger } from "./config.js";
import { storageStatePath } from "./util.js";

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  client: ApiClient;
  auth: AuthSession;
}

export interface SessionOptions {
  headful?: boolean;
  forceLogin?: boolean;
}

/**
 * Launches a browser, establishes an authenticated LXP session, and returns a
 * ready-to-use ApiClient (direct JSON access) plus the live page.
 *
 * Strategy:
 *  The LXP access token is single-use and short-lived: it is only issued during a
 *  fresh Lyceum → SSO handshake and is immediately invalidated on any reuse. The
 *  saved `storageState.json` token therefore never works for a later run. So we
 *  always perform a fresh credential login via `unifoa.lyceum.com.br`.
 */
export async function createSession(options: SessionOptions = {}): Promise<Session> {
  const headful = options.headful ?? config.headful;
  const args = config.playwrightNoSandbox ? ["--no-sandbox"] : [];
  const browser = await chromium.launch({
    headless: !headful,
    channel: "chromium",
    args,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });

  // tsx/esbuild transpiles with `keepNames: true`, which emits a `__name(fn, "name")`
  // call after every named function. Playwright serializes `page.evaluate` callbacks
  // into the page without the module-level `__name` helper, so any named function
  // inside a callback throws `ReferenceError: __name is not defined`. Defining it here
  // (as a pass-through) makes every `page.evaluate`/`addInitScript` callback safe.
  await context.addInitScript("globalThis.__name = (target) => target;");

  let page = await context.newPage();
  try {
    if (!hasCredentials()) {
      throw new Error(
        "no credentials; set LXP_USERNAME/LXP_PASSWORD in .env",
      );
    }

    page = await authenticate(context, page, { forceLogin: true });
    const auth = await readToken(page);
    if (!auth) {
      throw new Error("plataforma_accessToken not found after login");
    }

    const client = new ApiClient({ token: auth.token, notice: auth.notice });
    return { browser, context, page, client, auth };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

export async function closeSession(session: Session): Promise<void> {
  await session.context.close().catch(() => {});
  await session.browser.close().catch(() => {});
}

export function sessionStatePathForLogging(): string {
  return storageStatePath();
}

export { hasCredentials, logger };

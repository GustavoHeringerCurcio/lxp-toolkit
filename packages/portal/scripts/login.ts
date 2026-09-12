import { chromium } from "playwright";
import { authenticate, readToken, saveSession } from "../src/auth.js";
import { config, hasCredentials } from "../src/config.js";

/**
 * One-time interactive login. Fills Lyceum credentials, follows the SSO redirect,
 * verifies the LXP token is present, then saves the browser session to
 * data/storageState.json so subsequent runs don't need to log in again.
 *
 * If a reCAPTCHA appears, the script pauses so you can solve it in the browser
 * window and press Enter to continue.
 *
 * Usage: npm run login
 */
async function main(): Promise<void> {
  if (!hasCredentials()) {
    throw new Error("LXP_USERNAME and LXP_PASSWORD are required in .env");
  }

  const args = config.playwrightNoSandbox ? ["--no-sandbox"] : [];
  const browser = await chromium.launch({ headless: false, channel: "chromium", args });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();

  const promptCaptcha = async (): Promise<void> => {
    console.log("\nreCAPTCHA detected — solve it in the browser window, then press Enter.");
    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve());
    });
  };

  try {
    await authenticate(context, page, { forceLogin: true, onCaptcha: promptCaptcha });

    const auth = await readToken(page);
    if (!auth) {
      throw new Error("plataforma_accessToken not found after login");
    }
    console.log(`Login successful. Token acquired (length ${auth.token.length}).`);

    await saveSession(context);
    console.log("Session saved to data/storageState.json");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { createSession, closeSession } from "../src/session.js";
import { config, logger } from "../src/config.js";

/**
 * Gated browser-runner that submits one file-upload answer to the LXP portal.
 *
 * The LXP submit API was never captured and AWS WAF fronts writes, so we drive
 * the real SPA: fresh login → $nuxt route to the task → attach a file built from
 * the answer text → click the real submit → report.
 *
 * Usage:
 *   tsx scripts/submit-task.ts --req <request.json> --result <result.json> [--headful]
 *
 * Request JSON:
 *   { "action": "upload", "courseId": number, "itemId": number, "answer": string, "ext"?: "md"|"txt" }
 *
 * Result JSON:
 *   { "ok": boolean, "status": "ok"|"unknown"|"error", "detail": string, "at": string }
 */
interface SubmitRequest {
  action: "upload";
  courseId: number;
  itemId: number;
  answer: string;
  ext?: "md" | "txt";
}

interface SubmitResult {
  ok: boolean;
  status: "ok" | "unknown" | "error";
  detail: string;
  at: string;
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function snippet(text: string, max = 400): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

async function clientNav(page: Page, pathName: string): Promise<void> {
  await page
    .evaluate((p) => {
      const w = window as unknown as { $nuxt?: { $router: { push(p: string): Promise<unknown> } } };
      return w.$nuxt?.$router.push(p);
    }, pathName)
    .then(() => {});
}

/** Best-effort discovery of clickable texts on the page (to guide tuning). */
async function candidateTexts(page: Page): Promise<string[]> {
  const texts = await page
    .locator("button, [role='button'], a, label")
    .allInnerTexts()
    .catch(() => []);
  return [...new Set(texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 25);
}

async function findFileInput(page: Page, timeoutMs: number): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const input = page.locator("input[type='file']").first();
    const count = await input.count().catch(() => 0);
    if (count > 0) return input;
    // Maybe an "attach" button must be clicked first to mount the input.
    const trigger = page
      .locator("button, [role='button']")
      .filter({ hasText: /anexar|enviar arquivo|adicionar arquivo|upload|escolher arquivo|arquivo/i })
      .first();
    if ((await trigger.count().catch(() => 0)) > 0) {
      await trigger.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(800);
    } else {
      await page.waitForTimeout(700);
    }
  }
  return null;
}

async function findSubmit(page: Page): Promise<Locator | null> {
  const typed = page.locator("button[type='submit']").filter({ visible: true }).first();
  if ((await typed.count().catch(() => 0)) > 0) return typed;
  const texted = page
    .locator("button, [role='button']")
    .filter({ hasText: /entregar|enviar|finalizar|concluir|submeter/i })
    .filter({ visible: true })
    .first();
  if ((await texted.count().catch(() => 0)) > 0) return texted;
  return null;
}

async function confirmDialog(page: Page): Promise<void> {
  // Some flows show a confirmation modal right after the main submit click.
  const confirm = page
    .locator("[role='dialog'], .modal, .dialog, [class*='modal' i] button, body button")
    .filter({ hasText: /confirmar|sim, enviar|sim|finalizar/i })
    .filter({ visible: true })
    .first();
  if ((await confirm.count().catch(() => 0)) > 0) {
    await confirm.click({ timeout: 1500 }).catch(() => {});
  }
}

async function detectSuccess(page: Page): Promise<{ ok: boolean; snippet: string }> {
  await page.waitForTimeout(5_000);
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const success =
    /entregue|atividade entregue|entregue com sucesso|concluído com sucesso|tudo certo|resposta enviada|sucesso/i.test(body);
  return { ok: success, snippet: snippet(body, 500) };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reqPath = flagValue(args, "--req");
  const resultPath = flagValue(args, "--result");
  const headful = args.includes("--headful") || config.headful;
  if (!reqPath || !resultPath) {
    console.error("usage: tsx scripts/submit-task.ts --req <req.json> --result <result.json> [--headful]");
    process.exit(2);
  }

  let req: SubmitRequest;
  let result: SubmitResult;
  const fail = (detail: string, status: "error" | "unknown" = "error") => {
    result = { ok: false, status, detail, at: new Date().toISOString() };
    writeResult(resultPath, result);
    console.error(`submit-task failed [${status}]: ${detail}`);
    process.exit(status === "unknown" ? 0 : 1);
  };

  try {
    req = JSON.parse(readFileSync(reqPath, "utf-8")) as SubmitRequest;
  } catch (err) {
    return fail(`cannot read request file: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (req.action !== "upload") return fail("only action 'upload' is supported for now");
  if (!req.answer || !req.answer.trim()) return fail("request has no answer text");

  const session = await createSession({ headful }).catch((err) => {
    fail(`login failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  if (!session) return;
  try {
    const { page } = session;
    const route = `/course/${req.courseId}/content/${req.itemId}`;
    logger.info({ route }, "navigating to task");
    await clientNav(page, route);
    await page.waitForTimeout(8_000);

    // Build the answer file from the text and attach it.
    const ext = req.ext ?? "md";
    const filePath = path.join(tmpdir(), `lxp-submit-${Date.now()}-${req.itemId}.${ext}`);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, req.answer, "utf-8");

    const fileInput = await findFileInput(page, 15_000);
    if (!fileInput) {
      const candidates = await candidateTexts(page).catch(() => []);
      return fail(`no file input found. Buttons/labels seen: ${candidates.join(" | ")}`);
    }
    await fileInput.setInputFiles(filePath);
    logger.info("file attached");

    // Give the SPA a beat to register the file before looking for submit.
    await page.waitForTimeout(2_000);

    const submit = await findSubmit(page);
    if (!submit) {
      const candidates = await candidateTexts(page).catch(() => []);
      return fail(`no submit button found. Buttons/labels seen: ${candidates.join(" | ")}`);
    }
    await submit.click();
    await confirmDialog(page);

    const detection = await detectSuccess(page);
    if (detection.ok) {
      result = { ok: true, status: "ok", detail: snippet(detection.snippet, 300), at: new Date().toISOString() };
    } else {
      result = {
        ok: false,
        status: "unknown",
        detail: `submit clicked but success not confirmed. Page: ${snippet(detection.snippet, 300)}`,
        at: new Date().toISOString(),
      };
    }
    writeResult(resultPath, result);
    console.log(`submit-task done [${result.status}]`);
    process.exit(result.status === "ok" ? 0 : 0);
  } finally {
    await closeSession(session).catch(() => {});
  }
}

function writeResult(resultPath: string, result: SubmitResult): void {
  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

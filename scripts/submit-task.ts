import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { createSession, closeSession } from "../src/session.js";
import { config, logger } from "../src/config.js";

/**
 * Gated browser-runner that submits one answer to the LXP portal.
 *
 * The LXP submit API was never captured and AWS WAF fronts writes, so we drive
 * the real SPA: fresh login → $nuxt route to the task → answer it (attach a file
 * for uploads, select options for quizzes) → click the real submit → report.
 *
 * Usage:
 *   tsx scripts/submit-task.ts --req <request.json> --result <result.json> [--headful]
 *
 * Upload request JSON:
 *   { "action": "upload", "courseId": number, "itemId": number, "answer": string, "ext"?: "md"|"txt" }
 *
 * Quiz request JSON:
 *   { "action": "quiz", "courseId": number, "itemId": number,
 *     "selections": [{ questionId, optionIndex, letter, questionText, optionText }] }
 *
 * Result JSON:
 *   { "ok": boolean, "status": "ok"|"unknown"|"error", "detail": string, "at": string }
 */
interface QuizItem {
  questionId: number;
  optionIndex: number;
  letter: string;
  questionText: string;
  optionText: string;
}

type SubmitRequest =
  | { action: "upload"; courseId: number; itemId: number; answer: string; ext?: "md" | "txt" }
  | { action: "quiz"; courseId: number; itemId: number; selections: QuizItem[] };

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

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function clientNav(page: Page, pathName: string): Promise<void> {
  await page
    .evaluate((p) => {
      const w = window as unknown as { $nuxt?: { $router: { push(p: string): Promise<unknown> } } };
      return w.$nuxt?.$router.push(p);
    }, pathName)
    .then(() => {});
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
      .filter({ hasText: /anexar|enviar arquivo|adicionar arquivo|upload|escolher arquivo|arquivo|attach|choose file|select file|drag and drop/i })
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

async function isEnabled(loc: Locator): Promise<boolean> {
  return !(await loc.isDisabled().catch(() => false));
}

/**
 * Fill the rich-text (TinyMCE) reply box with the answer text. File-upload
 * tasks submit a "reply"; leaving the text empty makes the portal warn and may
 * mark the attempt invalid. Returns true when an editor was found.
 */
async function fillEditor(page: Page, text: string): Promise<boolean> {
  const frames = [".tox-edit-area__iframe", "iframe[title*='Rich Text' i]", "iframe[id*='tinymce' i]"];
  for (const sel of frames) {
    try {
      const body = page.frameLocator(sel).first().locator("body");
      if ((await body.count()) === 0) continue;
      await body.click({ timeout: 3000 }).catch(() => {});
      await body.fill(text).catch(async () => {
        await page.keyboard.insertText(text);
      });
      return true;
    } catch {
      /* try next selector */
    }
  }
  return false;
}

/**
 * Find the button that submits the activity. The portal UI can render in
 * Portuguese or English, and file-upload tasks sometimes use a composer with
 * "Save draft" + "Send reply". Prefer send/submit-like buttons (enabled) over
 * draft/save ones.
 */
async function findSubmit(page: Page): Promise<Locator | null> {
  const typed = page.locator("button[type='submit'], input[type='submit']").filter({ visible: true }).first();
  if ((await typed.count().catch(() => 0)) > 0 && (await isEnabled(typed))) return typed;

  const sendRe = /send reply|send|submit|reply|post|entregar|enviar|responder|submeter|finalizar|concluir/i;
  const draftRe = /save draft|salvar rascunho|rascunho|\bdraft\b/i;

  const candidates = page
    .locator("button, [role='button'], input[type='submit'], input[type='button']")
    .filter({ visible: true });
  const count = await candidates.count().catch(() => 0);
  let firstSendLike: Locator | null = null;
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    const text = ((await el.innerText().catch(() => "")) || (await el.getAttribute("value")) || "").trim();
    if (!sendRe.test(text) || draftRe.test(text)) continue;
    if (!firstSendLike) firstSendLike = el;
    if (await isEnabled(el)) return el;
  }
  if (firstSendLike) return firstSendLike;

  const fallback = page
    .locator("button, [role='button'], input[type='submit'], input[type='button']")
    .filter({ hasText: /save|salvar/i })
    .filter({ visible: true })
    .first();
  if ((await fallback.count().catch(() => 0)) > 0) return fallback;
  return null;
}

/** Wait until a submit button exists and is enabled (uploads may take a moment). */
async function waitForSubmit(page: Page, timeoutMs: number): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await findSubmit(page);
    if (s && (await isEnabled(s))) return s;
    await page.waitForTimeout(700);
  }
  return findSubmit(page);
}

/** Describe visible buttons (tag, type, disabled, text) for failure diagnostics. */
async function describeButtons(page: Page): Promise<string> {
  const btns = page.locator("button, [role='button'], input[type='submit'], input[type='button'], a[role='button']");
  const count = await btns.count().catch(() => 0);
  const out: string[] = [];
  for (let i = 0; i < count && out.length < 30; i++) {
    const b = btns.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const tag = await b.evaluate((el) => el.tagName.toLowerCase()).catch(() => "?");
    const type = await b.getAttribute("type").catch(() => null);
    const text = (((await b.innerText().catch(() => "")) || (await b.getAttribute("value")) || "") as string)
      .replace(/\s+/g, " ")
      .trim();
    const disabled = await b.isDisabled().catch(() => false);
    out.push(`${tag}${type ? `[type=${type}]` : ""}${disabled ? "(disabled)" : ""}: "${text.slice(0, 60)}"`);
  }
  return out.join(" | ");
}

async function confirmDialog(page: Page): Promise<void> {
  // File-upload tasks show a confirmation modal after the main "Send reply"
  // click ("Submission confirmation ... Do you want to send anyway?"), whose
  // confirm button is also labeled "Send reply". Wait for it and confirm.
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const dialog = page.locator("[role='dialog'], .v-dialog, [class*='dialog' i]").filter({ visible: true }).last();
    if ((await dialog.count().catch(() => 0)) > 0) {
      const confirm = dialog
        .locator("button, [role='button']")
        .filter({ hasText: /send reply|confirmar|confirm|enviar|yes|sim|\bok\b/i })
        .filter({ hasNotText: /cancel|cancelar|voltar/i })
        .filter({ visible: true })
        .last();
      if ((await confirm.count().catch(() => 0)) > 0) {
        await confirm.click({ timeout: 2_500 }).catch(() => {});
        return;
      }
    }
    await page.waitForTimeout(300);
  }
}

async function detectSuccess(page: Page): Promise<{ ok: boolean; snippet: string }> {
  await page.waitForTimeout(5_000);
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const success =
    /entregue|atividade entregue|entregue com sucesso|concluído com sucesso|tudo certo|resposta enviada|enviado com sucesso|sucesso|sent successfully|reply sent|sent|success|posted|replied|submitted|uploaded/i.test(
      body,
    );
  return { ok: success, snippet: snippet(body, 500) };
}

/** Click one quiz option: find the question container, then the matching option. */
async function clickQuizOption(page: Page, sel: QuizItem): Promise<boolean> {
  const qNeedle = normalize(sel.questionText).slice(0, 40);
  const oNeedle = normalize(sel.optionText).slice(0, 40);
  if (!qNeedle) return false;

  const containers = page.locator(
    "fieldset, li, [class*='question' i], [class*='questao' i], [class*='enunciated' i], [class*='answer' i], [data-question-id]",
  );
  const count = await containers.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const c = containers.nth(i);
    const text = normalize(await c.innerText().catch(() => ""));
    if (!text.includes(qNeedle)) continue;

    // 1) Option by text (label / button / clickable).
    if (oNeedle) {
      const byText = c
        .locator("label, button, [role='radio'], [role='button'], [class*='option' i], [class*='alternativa' i]")
        .filter({ hasText: oNeedle })
        .filter({ visible: true })
        .first();
      if ((await byText.count().catch(() => 0)) > 0) {
        await byText.click({ timeout: 2000 }).catch(() => {});
        return true;
      }
    }

    // 2) Radio input by index.
    const radios = c.locator("input[type='radio']");
    if ((await radios.count().catch(() => 0)) > sel.optionIndex) {
      await radios.nth(sel.optionIndex).check({ timeout: 2000 }).catch(async () => {
        await radios.nth(sel.optionIndex).click({ timeout: 2000 }).catch(() => {});
      });
      return true;
    }

    // 3) Any clickable option by index.
    const options = c.locator("label, [role='radio'], [role='button'], [class*='option' i], [class*='alternativa' i], li");
    if ((await options.count().catch(() => 0)) > sel.optionIndex) {
      await options.nth(sel.optionIndex).click({ timeout: 2000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function answerQuiz(
  page: Page,
  selections: QuizItem[],
): Promise<{ done: number; total: number; notes: string[] }> {
  const notes: string[] = [];
  let done = 0;
  for (const sel of selections) {
    const ok = await clickQuizOption(page, sel).catch(() => false);
    if (ok) done++;
    else notes.push(`Q${sel.questionId}: alternativa "${sel.optionText.slice(0, 40)}" não encontrada`);
  }
  return { done, total: selections.length, notes };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reqPath = flagValue(args, "--req");
  const resultPath = flagValue(args, "--result");
  const headful = args.includes("--headful") || config.headful;
  const dryRun = args.includes("--dry-run") || args.includes("--dryrun");
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
  if (req.action === "upload" && (!req.answer || !req.answer.trim())) return fail("request has no answer text");
  if (req.action === "quiz" && (!req.selections || req.selections.length === 0)) return fail("request has no selections");

  const session = await createSession({ headful }).catch((err) => {
    fail(`login failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  if (!session) return;
  try {
    const { page } = session;
    const route = `/course/${req.courseId}/content/${req.itemId}`;
    logger.info({ route, action: req.action }, "navigating to task");
    await clientNav(page, route);
    await page.waitForTimeout(8_000);

    if (req.action === "quiz") {
      const outcome = await answerQuiz(page, req.selections);
      logger.info(outcome, "quiz options selected");
      if (outcome.done === 0) {
        const buttons = await describeButtons(page).catch(() => "");
        return fail(`nenhuma alternativa marcada. ${outcome.notes.join(" | ")}. Botões: ${buttons}`);
      }
      const submit = await waitForSubmit(page, 15_000);
      if (!submit) {
        const buttons = await describeButtons(page).catch(() => "");
        return fail(`no submit button found. Buttons seen: ${buttons}`);
      }
      if (dryRun) {
        const buttons = await describeButtons(page).catch(() => "");
        const text = ((await submit.innerText().catch(() => "")) || "").trim();
        result = {
          ok: true,
          status: "unknown",
          detail: `dry-run: submit="${text}" (${outcome.done}/${outcome.total} marcadas). Botões: ${buttons}`,
          at: new Date().toISOString(),
        };
        writeResult(resultPath, result);
        console.log("submit-task dry-run done");
        process.exit(0);
      }
      const clicked = await submit
        .click({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        const buttons = await describeButtons(page).catch(() => "");
        return fail(`submit button found but not clickable (disabled?). Buttons: ${buttons}`);
      }
      await confirmDialog(page);
      const detection = await detectSuccess(page);
      if (detection.ok) {
        result = {
          ok: true,
          status: "ok",
          detail: `${outcome.done}/${outcome.total} marcadas. ${snippet(detection.snippet, 200)}`,
          at: new Date().toISOString(),
        };
      } else {
        result = {
          ok: false,
          status: "unknown",
          detail: `submit clicado mas sucesso não confirmado (${outcome.done}/${outcome.total} marcadas). Page: ${snippet(detection.snippet, 300)}`,
          at: new Date().toISOString(),
        };
      }
      writeResult(resultPath, result);
      console.log(`submit-task done [${result.status}]`);
      process.exit(0);
    }

    // Build the answer file from the text and attach it.
    const ext = req.ext ?? "md";
    const filePath = path.join(tmpdir(), `lxp-submit-${Date.now()}-${req.itemId}.${ext}`);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, req.answer, "utf-8");

    const fileInput = await findFileInput(page, 15_000);
    if (!fileInput) {
      const buttons = await describeButtons(page).catch(() => "");
      return fail(`no file input found. Buttons seen: ${buttons}`);
    }
    await fileInput.setInputFiles(filePath);
    logger.info("file attached");

    const filled = await fillEditor(page, req.answer).catch(() => false);
    logger.info({ filled }, "reply text filled");

    // Give the SPA a beat to register the file, then wait for the submit to enable.
    await page.waitForTimeout(2_000);

    const submit = await waitForSubmit(page, 20_000);
    if (!submit) {
      const buttons = await describeButtons(page).catch(() => "");
      return fail(`no submit button found. Buttons seen: ${buttons}`);
    }
    if (dryRun) {
      const buttons = await describeButtons(page).catch(() => "");
      const text = ((await submit.innerText().catch(() => "")) || "").trim();
      result = {
        ok: true,
        status: "unknown",
        detail: `dry-run: submit="${text}". Botões: ${buttons}`,
        at: new Date().toISOString(),
      };
      writeResult(resultPath, result);
      console.log("submit-task dry-run done");
      process.exit(0);
    }
    const clicked = await submit
      .click({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) {
      const buttons = await describeButtons(page).catch(() => "");
      return fail(`submit button found but not clickable (disabled?). Buttons: ${buttons}`);
    }
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
    process.exit(0);
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

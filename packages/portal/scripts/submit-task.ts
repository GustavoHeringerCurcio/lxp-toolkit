import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { createSession, closeSession } from "../src/session.js";
import { markRead } from "../src/actions.js";
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
 *   { "action": "upload", "courseId": number, "itemId": number, "answer": string,
 *     "mode"?: "text"|"txt"|"pdf", "ext"?: "md"|"txt", "filename"?: string,
 *     "filePath"?: string }
 *   `mode` selects how the answer reaches the portal:
 *     - "text" (default when set): typed straight into the reply editor, no file.
 *     - "txt": written to a temp `.txt` file and attached.
 *     - "pdf": attaches the pre-generated PDF at `filePath` (the assistant server
 *       renders it from the answer and passes the absolute path).
 *   When omitted, "txt" is assumed for backward compatibility.
 *   `filename` is an optional attachment base name (no extension), e.g.
 *   "Aluno Exemplo_BDI - Atividade 01". When omitted the runner falls
 *   back to a generic "lxp-submit-<timestamp>-<itemId>" name.
 *
 * Quiz request JSON:
 *   { "action": "quiz", "courseId": number, "itemId": number, "enrollmentId"?: number,
 *     "survey"?: boolean,
 *     "selections": [{ questionId, optionIndex, letter, optionId, questionText, optionText }] }
 *   When `enrollmentId` is present the runner submits through the SPA's own
 *   Vuex actions (actionAnswerQuizQuestion → actionFinishQuizAttempt); otherwise
 *   it falls back to clicking the options in the DOM. When `survey` is true
 *   (a "Pesquisa") it only answers the questions and skips the attempt/finish
 *   step, which pesquisas do not use.
 *
 * Mark request JSON (manually "mark as completed"):
 *   { "action": "mark", "courseId": number, "itemId": number }
 *
 * Result JSON:
 *   { "ok": boolean, "status": "ok"|"unknown"|"error", "detail": string, "at": string }
 */
interface QuizItem {
  questionId: number;
  optionIndex: number;
  letter: string;
  /** Portal option id — required to submit through the SPA store/endpoint. */
  optionId?: number;
  questionText: string;
  optionText: string;
}

type UploadMode = "text" | "txt" | "pdf";

type SubmitRequest =
  | {
      action: "upload";
      courseId: number;
      itemId: number;
      answer: string;
      /** How the answer reaches the portal. Defaults to "txt". */
      mode?: UploadMode;
      ext?: "md" | "txt";
      filename?: string;
      /** Absolute path to a pre-generated file to attach (used by "pdf"). */
      filePath?: string;
    }
  | {
      action: "quiz";
      courseId: number;
      itemId: number;
      /** Portal enrollment id (from the topic context); enables the store path. */
      enrollmentId?: number;
      /** A "Pesquisa": answer only, no attempt/finish cycle. */
      survey?: boolean;
      selections: QuizItem[];
    }
  | { action: "mark"; courseId: number; itemId: number };

interface SubmitResult {
  ok: boolean;
  status: "ok" | "already" | "unknown" | "error";
  detail: string;
  at: string;
  attachmentName?: string;
  portalDetail?: string;
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

/**
 * Turn a requested attachment name into a safe basename. Keeps spaces, hyphens
 * and accents; strips path separators and characters that are illegal on
 * Windows/macOS filesystems, collapses whitespace and caps the length.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
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

/**
 * Detect that the activity was already submitted. After a submission the portal
 * disables the composer and shows "Limit reached / It is not possible to upload
 * more files". Returns a friendly reason, or null when it looks submittable.
 */
async function detectAlreadySubmitted(page: Page, structural = false): Promise<string | null> {
  const body = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const patterns: [RegExp, string][] = [
    [/limit reached|not possible to upload more files/i, "O portal já registrou um envio (limite de arquivos atingido)."],
    [/already submitted|already sent|you have already|has already been (sent|submitted)/i, "O portal indica que esta atividade já foi enviada."],
    [/já (foi )?entregue|já enviad|limite atingido|não é possível enviar mais/i, "O portal indica que esta atividade já foi entregue."],
  ];
  for (const [re, msg] of patterns) {
    if (re.test(body)) return msg;
  }
  if (structural) {
    // After a submission the composer stays but is disabled: no file input and
    // no enabled send button.
    const hasEditor =
      (await page.locator(".tox-edit-area, .tox-toolbar, [class*='tinymce' i]").count().catch(() => 0)) > 0;
    const fileInputs = await page.locator("input[type='file']").count().catch(() => 0);
    const sendBtns = await page
      .locator("button, [role='button']")
      .filter({ hasText: /send reply|entregar|enviar|submeter|responder|send|submit/i })
      .filter({ visible: true })
      .count()
      .catch(() => 0);
    if (hasEditor && fileInputs === 0 && sendBtns === 0) {
      return "A atividade já foi entregue: o formulário de envio está desabilitado.";
    }
  }
  return null;
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

interface StoreQuizResult {
  answered: number;
  total: number;
  finished: boolean;
  attemptId: number | null;
  notes: string[];
  error?: string;
}

/**
 * Submit a quiz by driving the SPA's own Vuex store instead of scraping the DOM.
 * The portal actions are namespaced `plataforma/enrollment` and build (verified
 * against the live SPA by aborting the network call):
 *   POST /v1/plataforma/content/enrollment/{enrollmentId}/quiz/{topicId}
 *        body { questionId, optionId }             (actionAnswerQuizQuestion)
 *   POST /v1/plataforma/content/enrollment/{enrollmentId}/quiz/{topicId}/attempt/{attemptId}
 *        body null                                 (actionFinishQuizAttempt)
 * Payloads:
 *   answer: { enrollmentId, topic: { topicId }, questionId, optionId }
 *   finish: { enrollmentId, topic: { topicId }, attemptId }
 * This reuses the live bearer token + AWS WAF session, so it is far more robust
 * than clicking options. `survey` skips the finish step: a pesquisa is submitted
 * by answering the question, with no attempt/finish cycle.
 */
async function submitQuizViaStore(
  page: Page,
  enrollmentId: number,
  topicId: number,
  selections: QuizItem[],
  survey = false,
): Promise<StoreQuizResult> {
  const args = {
    enrollmentId,
    topicId,
    survey,
    selections: selections.map((s) => ({ questionId: s.questionId, optionId: s.optionId ?? 0 })),
  };
  return page.evaluate((arg) => {
    interface Store {
      dispatch: (type: string, payload?: unknown) => Promise<unknown>;
      getters: Record<string, unknown>;
      state?: Record<string, unknown>;
    }
    const w = window as unknown as { $nuxt?: { $store?: Store } };
    const store = w.$nuxt?.$store;
    if (!store) {
      return {
        answered: 0,
        total: arg.selections.length,
        finished: false,
        attemptId: null,
        notes: [] as string[],
        error: "no-store",
      };
    }
    const topic = { topicId: arg.topicId };
    const notes: string[] = [];
    let answered = 0;
    let attemptId: number | null = null;

    const messageOf = (err: unknown): string => {
      if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
      return String(err);
    };
    const numberOrNull = (value: unknown): number | null => {
      if (value == null) return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    };
    const attemptIdFrom = (data: unknown): number | null => {
      if (!data || typeof data !== "object") return null;
      const o = data as Record<string, unknown>;
      const direct = numberOrNull(o.enrollmentQuizAttemptId) ?? numberOrNull(o.attemptId) ?? numberOrNull(o.id);
      if (direct != null) return direct;
      const lists: unknown[] = [o.attempts, (o.content as Record<string, unknown> | undefined)?.attempts];
      for (const list of lists) {
        if (!Array.isArray(list) || list.length === 0) continue;
        const last = list[list.length - 1] as Record<string, unknown>;
        const id = numberOrNull(last?.id) ?? numberOrNull(last?.attemptId);
        if (id != null) return id;
      }
      return null;
    };
    const attemptIdFromStore = (): number | null => {
      const candidates: unknown[] = [];
      try {
        candidates.push(store.getters["plataforma/enrollment/getterSelectedTopic"]);
        candidates.push(store.getters["plataforma/content/getterSelectedTopic"]);
        const state = store.state?.plataforma as Record<string, unknown> | undefined;
        candidates.push((state?.enrollment as Record<string, unknown> | undefined)?.selectedTopic);
        candidates.push((state?.content as Record<string, unknown> | undefined)?.selectedTopic);
      } catch {
        /* ignore */
      }
      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const o = c as Record<string, unknown>;
        const direct = numberOrNull(o.enrollmentQuizAttemptId);
        if (direct != null) return direct;
        const atts = (o.content as Record<string, unknown> | undefined)?.attempts;
        if (Array.isArray(atts) && atts.length) {
          const last = atts[atts.length - 1] as Record<string, unknown>;
          const id = numberOrNull(last?.id) ?? numberOrNull(last?.attemptId);
          if (id != null) return id;
        }
      }
      return null;
    };

    return (async () => {
      for (const sel of arg.selections) {
        try {
          const data = await store.dispatch("plataforma/enrollment/actionAnswerQuizQuestion", {
            enrollmentId: arg.enrollmentId,
            topic,
            questionId: sel.questionId,
            optionId: sel.optionId,
          });
          answered++;
          const id = attemptIdFrom(data);
          if (id != null) attemptId = id;
        } catch (err) {
          notes.push(`Q${sel.questionId}: ${messageOf(err)}`);
        }
      }

      if (attemptId == null) attemptId = attemptIdFromStore();

      // A pesquisa (survey) is submitted by answering; there is no attempt to finish.
      if (arg.survey) {
        return { answered, total: arg.selections.length, finished: answered > 0, attemptId, notes };
      }

      let finished = false;
      if (attemptId == null) {
        notes.push("attemptId não encontrado");
      } else {
        try {
          await store.dispatch("plataforma/enrollment/actionFinishQuizAttempt", {
            enrollmentId: arg.enrollmentId,
            topic,
            attemptId,
          });
          finished = true;
        } catch (err) {
          notes.push(`finish: ${messageOf(err)}`);
        }
      }
      return { answered, total: arg.selections.length, finished, attemptId, notes };
    })();
  }, args);
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
  const fail = (detail: string, status: "error" | "unknown" = "error"): never => {
    result = { ok: false, status, detail, at: new Date().toISOString() };
    writeResult(resultPath, result);
    console.error(`submit-task failed [${status}]: ${detail}`);
    process.exit(status === "unknown" ? 0 : 1);
  };
  const already = (detail: string) => {
    result = { ok: false, status: "already", detail, at: new Date().toISOString() };
    writeResult(resultPath, result);
    console.log("submit-task done [already]");
    process.exit(0);
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

  // "Mark as completed" is a plain progress POST — no SPA navigation needed.
  if (req.action === "mark") {
    try {
      const ok = await markRead(session.client, req.courseId, req.itemId);
      result = ok
        ? { ok: true, status: "ok", detail: "Item marcado como concluído no portal.", at: new Date().toISOString() }
        : {
            ok: false,
            status: "unknown",
            detail: "O portal não confirmou a marcação de progresso.",
            at: new Date().toISOString(),
          };
      writeResult(resultPath, result);
      console.log(`submit-task done [${result.status}]`);
      process.exit(0);
    } catch (err) {
      return fail(`mark failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const { page } = session;
    const route = `/course/${req.courseId}/content/${req.itemId}`;
    logger.info({ route, action: req.action }, "navigating to task");
    await clientNav(page, route);
    await page.waitForTimeout(8_000);

    const alreadyReason = await detectAlreadySubmitted(page).catch(() => null);
    if (alreadyReason && !dryRun) return already(alreadyReason);

    if (req.action === "quiz") {
      // Preferred path: drive the SPA store directly — no DOM scraping.
      if (req.enrollmentId) {
        // Track the quiz HTTP calls too: the Vuex action may reject while
        // committing the response even though the answer reached the server, so
        // the 2xx status is the source of truth.
        const quizResponses: { url: string; status: number; method: string }[] = [];
        const onQuizResponse = (res: import("playwright").Response): void => {
          const u = res.url();
          if (/\/content\/enrollment\/\d+\/quiz\//.test(u))
            quizResponses.push({ url: u, status: res.status(), method: res.request().method() });
        };
        page.on("response", onQuizResponse);
        const viaStore = await submitQuizViaStore(
          page,
          req.enrollmentId,
          req.itemId,
          req.selections,
          req.survey === true,
        )
          .catch(
            (err): StoreQuizResult => ({
              answered: 0,
              total: req.selections.length,
              finished: false,
              attemptId: null,
              notes: [err instanceof Error ? err.message : String(err)],
              error: "threw",
            }),
          )
          .finally(() => page.off("response", onQuizResponse));
        const answerHttpOk = quizResponses.filter(
          (r) => r.method === "POST" && !/\/attempt\//.test(r.url) && r.status >= 200 && r.status < 300,
        ).length;
        const answeredOk = Math.max(viaStore.answered, answerHttpOk);
        const allAnswered = req.selections.length > 0 && answeredOk >= req.selections.length;
        const finished = req.survey ? allAnswered : viaStore.finished;
        logger.info({ ...viaStore, answerHttpOk }, "quiz submitted via SPA store");
        if (allAnswered && finished) {
          result = {
            ok: true,
            status: "ok",
            detail: req.survey
              ? `${answeredOk}/${viaStore.total} respostas enviadas pelo endpoint do portal (pesquisa).`
              : `${answeredOk}/${viaStore.total} respostas enviadas pelo endpoint do portal.`,
            at: new Date().toISOString(),
          };
          writeResult(resultPath, result);
          console.log(`submit-task done [${result.status}]`);
          process.exit(0);
        }
        if (answeredOk > 0) {
          result = {
            ok: false,
            status: "unknown",
            detail: `${answeredOk}/${viaStore.total} respostas enviadas, mas a finalização não confirmou. ${viaStore.notes.join(" | ")}`,
            at: new Date().toISOString(),
          };
          writeResult(resultPath, result);
          console.log(`submit-task done [${result.status}]`);
          process.exit(0);
        }
        logger.warn({ ...viaStore, answerHttpOk }, "SPA store quiz path unavailable; falling back to DOM");
      }

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
          portalDetail: snippet(detection.snippet, 200),
        };
      } else {
        result = {
          ok: false,
          status: "unknown",
          detail: `submit clicado mas sucesso não confirmado (${outcome.done}/${outcome.total} marcadas). Page: ${snippet(detection.snippet, 300)}`,
          at: new Date().toISOString(),
          portalDetail: snippet(detection.snippet, 300),
        };
      }
      writeResult(resultPath, result);
      console.log(`submit-task done [${result.status}]`);
      process.exit(0);
    }

    // Resolve the attachment according to the requested mode.
    const mode: UploadMode = req.mode ?? "txt";
    let attachedPath: string | null = null;
    if (mode === "pdf") {
      if (!req.filePath) return fail("pdf mode requires a filePath");
      if (!existsSync(req.filePath)) return fail(`attachment not found: ${req.filePath}`);
      attachedPath = req.filePath;
    } else if (mode === "txt") {
      const ext = req.ext ?? "txt";
      const fallbackName = `lxp-submit-${Date.now()}-${req.itemId}`;
      const base = req.filename?.trim() ? sanitizeFilename(req.filename) : fallbackName;
      attachedPath = path.join(tmpdir(), `${base || fallbackName}.${ext}`);
      mkdirSync(path.dirname(attachedPath), { recursive: true });
      writeFileSync(attachedPath, req.answer, "utf-8");
    }

    if (attachedPath) {
      const fileInput = await findFileInput(page, 15_000);
      if (!fileInput) {
        const reason = await detectAlreadySubmitted(page, true).catch(() => null);
        if (reason) return already(reason);
        const buttons = await describeButtons(page).catch(() => "");
        return fail(`no file input found. Buttons seen: ${buttons}`);
      }
      await fileInput.setInputFiles(attachedPath);
      logger.info({ attachedPath }, "file attached");
    }

    const filled = await fillEditor(page, req.answer).catch(() => false);
    logger.info({ filled, mode }, "reply text filled");
    if (mode === "text" && !filled) {
      const buttons = await describeButtons(page).catch(() => "");
      return fail(`no reply editor found for text mode. Buttons seen: ${buttons}`);
    }

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
      result = {
        ok: true,
        status: "ok",
        detail: snippet(detection.snippet, 300),
        at: new Date().toISOString(),
        attachmentName: attachedPath ? path.basename(attachedPath) : undefined,
        portalDetail: snippet(detection.snippet, 300),
      };
    } else {
      result = {
        ok: false,
        status: "unknown",
        detail: `submit clicked but success not confirmed. Page: ${snippet(detection.snippet, 300)}`,
        at: new Date().toISOString(),
        attachmentName: attachedPath ? path.basename(attachedPath) : undefined,
        portalDetail: snippet(detection.snippet, 300),
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

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { ASSISTANT_DIR, dataDir, assist } from "../src/paths.js";
import { loadExercises } from "../src/build.js";
import {
  loadAiConfig,
  loadAnswers,
  loadOverrides,
  saveOverrides,
  saveProfile,
  loadProfile,
  saveAiConfig,
  saveAnswerVersion,
  getAnswerRecord,
  restoreAnswerVersion,
  clearAnswerHistory,
} from "../src/config.js";
import { enrich } from "../src/view.js";
import { generateAnswer } from "../src/ai.js";
import { parseQuizSelections } from "../src/prompt.js";
import type { AiActivitySections, AiStyle } from "../src/types.js";
import { launchUploadSubmit, launchQuizSubmit, lastSubmission, sendEnv, submissionsFor } from "../src/send.js";
import { officeToPdf, previewCacheDir } from "../src/office.js";

const DIST = path.join(ASSISTANT_DIR, "web", "dist");
const PORT = Number(process.env.PORT || 4174);
const REPO_ROOT = path.resolve(ASSISTANT_DIR, "..");

interface RefreshState {
  running: boolean;
  step: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  log: string;
}

const refresh: RefreshState = {
  running: false,
  step: "",
  error: null,
  startedAt: null,
  finishedAt: null,
  log: "",
};

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function appendRefreshLog(chunk: string): void {
  refresh.log = (refresh.log + chunk).slice(-8000);
}

/** Run one pipeline step, capturing its output into the shared refresh state. */
function runStep(args: string[], cwd: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    refresh.step = label;
    appendRefreshLog(`\n$ npm ${args.join(" ")}\n`);
    const child = spawn(NPM, args, { cwd, env: process.env });
    child.stdout?.on("data", (d: Buffer) => appendRefreshLog(d.toString()));
    child.stderr?.on("data", (d: Buffer) => appendRefreshLog(d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label}: o comando saiu com código ${code}`));
    });
  });
}

/** Scrape fresh content from the portal, then rebuild the assistant's list. */
async function runContentRefresh(): Promise<void> {
  if (refresh.running) return;
  refresh.running = true;
  refresh.step = "Iniciando…";
  refresh.error = null;
  refresh.log = "";
  refresh.startedAt = new Date().toISOString();
  refresh.finishedAt = null;
  try {
    await runStep(["run", "dump"], REPO_ROOT, "Buscando conteúdo novo no portal");
    await runStep(["run", "index"], ASSISTANT_DIR, "Montando a lista de atividades");
    refresh.step = "Concluído";
  } catch (err) {
    refresh.error = err instanceof Error ? err.message : String(err);
    refresh.step = "Falhou";
  } finally {
    refresh.running = false;
    refresh.finishedAt = new Date().toISOString();
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".zip": "application/zip",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendStatic(res: import("node:http").ServerResponse, file: string, fallback?: string): void {
  const target = existsSync(file) && !statSync(file).isDirectory() ? file : fallback;
  if (!target || !existsSync(target)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream" });
  createReadStream(target).pipe(res);
}

function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/** Hosts allowed as preview sources (public LXP static CDN). Prevents SSRF. */
const PREVIEW_ALLOWED_HOSTS = new Set(["static.plataforma.grupoa.education"]);
const PREVIEW_MAX_BYTES = 40 * 1024 * 1024;

/**
 * Convert a remote Office/OpenDocument attachment to PDF (cached) and stream it
 * inline so the browser can render it like any other PDF.
 */
async function servePreview(res: import("node:http").ServerResponse, rawUrl: string, headOnly = false): Promise<void> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return json(res, 400, { error: "url inválida" });
  }
  if (target.protocol !== "https:" || !PREVIEW_ALLOWED_HOSTS.has(target.hostname)) {
    return json(res, 403, { error: "host de origem não permitido" });
  }

  const cache = previewCacheDir();
  const srcDir = path.join(cache, "src");
  const ext = path.extname(target.pathname).replace(/^\./, "").toLowerCase();
  const key = createHash("sha256").update(target.href).digest("hex");
  const srcFile = path.join(srcDir, `${key}${ext ? `.${ext}` : ""}`);

  try {
    if (!existsSync(srcFile)) {
      const r = await fetch(target.href);
      if (!r.ok) return json(res, 502, { error: `download falhou (HTTP ${r.status})` });
      const declared = Number(r.headers.get("content-length") ?? 0);
      if (declared > PREVIEW_MAX_BYTES) return json(res, 413, { error: "arquivo grande demais" });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > PREVIEW_MAX_BYTES) return json(res, 413, { error: "arquivo grande demais" });
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(srcFile, buf);
    }

    const pdf = await officeToPdf(srcFile, cache);
    if (!pdf) return json(res, 422, { error: "não foi possível converter o arquivo" });

    const name = path.basename(target.pathname) || "preview";
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": statSync(pdf).size,
      "content-disposition": `inline; filename="${name.replace(/\.[a-z0-9]+$/i, ".pdf")}"`,
      "cache-control": "private, max-age=3600",
    });
    if (headOnly) {
      res.end();
      return;
    }
    createReadStream(pdf).pipe(res);
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Look up an enriched, non-hidden exercise view or throw a clear error. */
function findView(id: number) {
  const view = enrich(loadExercises(), loadAnswers(), loadOverrides()).find((x) => x.id === id && !x.hidden);
  if (!view) throw new Error(`exercício ${id} não encontrado`);
  return view;
}

function allViews() {
  return enrich(loadExercises(), loadAnswers(), loadOverrides()).filter((v) => !v.hidden);
}

const server = createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  const method = req.method ?? "GET";

  try {
    if (url === "/api/exercises") {
      return json(res, 200, { generatedAt: new Date().toISOString(), exercises: allViews() });
    }
    if (url === "/api/preview" && (method === "GET" || method === "HEAD")) {
      const src = new URL(req.url ?? "/", "http://local").searchParams.get("url") ?? "";
      if (!src) return json(res, 400, { error: "url obrigatória" });
      return await servePreview(res, src, method === "HEAD");
    }
    if (url === "/api/config") {
      const cfg = loadAiConfig();
      return json(res, 200, {
        model: cfg.model,
        max_output_tokens: cfg.max_output_tokens,
        temperature: cfg.temperature,
        configPath: assist("config", "ai-config.json"),
        style: cfg.style,
        activitySections: cfg.activitySections,
        profile: loadProfile(),
      });
    }
    if (url === "/api/refresh/status") {
      return json(res, 200, {
        running: refresh.running,
        step: refresh.step,
        error: refresh.error,
        startedAt: refresh.startedAt,
        finishedAt: refresh.finishedAt,
        log: refresh.log,
      });
    }
    if (url === "/api/profile" && method === "GET") {
      return json(res, 200, loadProfile());
    }

    // answers / history
    if (url.startsWith("/api/answer/") && url.endsWith("/restore") && method === "POST") {
      const seg = url.split("/");
      const id = Number(seg[3]);
      const b = await readBody(req);
      const index = Number(b.index);
      if (!id || Number.isNaN(index)) return json(res, 400, { error: "id e index obrigatórios" });
      const rec = restoreAnswerVersion(id, index);
      return json(res, 200, { current: rec, history: rec.history });
    }
    if (url.startsWith("/api/answer/") && url.endsWith("/history") && method === "DELETE") {
      const id = Number(url.split("/")[3]);
      const rec = clearAnswerHistory(id);
      return json(res, 200, { current: rec, history: rec.history });
    }
    if (url.startsWith("/api/answer/") && method === "GET") {
      const id = Number(url.split("/")[3]);
      const rec = getAnswerRecord(id);
      return json(res, 200, {
        current: rec ? { answer: rec.answer, updatedAt: rec.updatedAt, source: rec.source } : null,
        history: rec?.history ?? [],
      });
    }

    // portal send support
    if (url === "/api/send/config") {
      const env = sendEnv();
      return json(res, 200, { enabled: env.enabled, reason: env.reason });
    }
    if (url.startsWith("/api/send/preview")) {
      const id = Number(new URL(req.url ?? "/", "http://local").searchParams.get("id"));
      const view = findView(id);
      const canSubmit = (view.kind === "upload" || view.kind === "quiz") && view.status !== "done";
      return json(res, 200, {
        ok: canSubmit,
        reason: !canSubmit
          ? view.status === "done"
            ? "Esta atividade já está concluída."
            : "Não é possível enviar esta atividade por aqui."
          : "",
        kind: view.kind,
        title: view.title,
        courseName: view.courseName,
        status: view.status,
        hasAnswer: Boolean(view.answer?.trim()),
      });
    }
    if (url.startsWith("/api/send/")) {
      const id = Number(url.split("/")[3]);
      const last = lastSubmission(id);
      return json(res, 200, { submission: last ?? null, submissions: submissionsFor(id) });
    }

    if (method === "POST") {
      if (url === "/api/note") {
        const b = await readBody(req);
        const id = String(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const overrides = loadOverrides();
        overrides[id] = { ...(overrides[id] ?? {}), notes: String(b.notes ?? "") };
        saveOverrides(overrides);
        return json(res, 200, { ok: true });
      }
      if (url === "/api/ai-request") {
        // save per-exercise AiRequest override (or clear when raw is null)
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const overrides = loadOverrides();
        const entry = { ...(overrides[String(id)] ?? {}) };
        if (b.raw == null) {
          delete entry.aiRequest;
        } else {
          entry.aiRequest = String(b.raw);
        }
        overrides[String(id)] = entry;
        saveOverrides(overrides);
        const view = findView(id);
        return json(res, 200, { ok: true, aiRequestJson: view.aiRequestJson, hasAiOverride: view.hasAiOverride });
      }
      if (url === "/api/profile") {
        const b = await readBody(req);
        saveProfile({
          nome: String(b.nome ?? "").trim(),
          matricula: String(b.matricula ?? "").trim(),
        });
        return json(res, 200, { ok: true });
      }
      if (url === "/api/refresh") {
        if (refresh.running) return json(res, 200, { running: true });
        void runContentRefresh();
        return json(res, 200, { started: true });
      }
      if (url === "/api/ai-config") {
        const b = await readBody(req);
        const cfg = loadAiConfig();
        const next = { ...cfg };
        if (b.model != null) next.model = String(b.model).trim() || cfg.model;
        if (b.temperature != null) {
          const t = Number(b.temperature);
          if (!Number.isNaN(t)) next.temperature = t;
        }
        if (b.max_output_tokens != null) {
          const m = Number(b.max_output_tokens);
          if (!Number.isNaN(m) && m > 0) next.max_output_tokens = m;
        }
        if (b.style && typeof b.style === "object" && !Array.isArray(b.style)) {
          next.style = { ...next.style, ...(b.style as Partial<AiStyle>) };
        }
        if (b.activitySections && typeof b.activitySections === "object" && !Array.isArray(b.activitySections)) {
          next.activitySections = {
            ...next.activitySections,
            ...(b.activitySections as Partial<AiActivitySections>),
          };
        }
        saveAiConfig(next);
        return json(res, 200, {
          ok: true,
          model: next.model,
          temperature: next.temperature,
          max_output_tokens: next.max_output_tokens,
          style: next.style,
          activitySections: next.activitySections,
        });
      }
      if (url === "/api/answer/manual") {
        const b = await readBody(req);
        const id = Number(b.id);
        const answer = String(b.answer ?? "").trim();
        if (!id || !answer) return json(res, 400, { error: "answer required" });
        const view = findView(id);
        const selections = view.kind === "quiz" ? parseQuizSelections(answer, view.questions) : [];
        const rec = saveAnswerVersion(id, answer, "manual", undefined, selections);
        return json(res, 200, { ok: true, current: rec, history: rec.history, updatedAt: rec.updatedAt });
      }
      if (url === "/api/answer") {
        const b = await readBody(req);
        const id = Number(b.id);
        const view = findView(id);
        const cfg = { ...loadAiConfig(), ...(b.model ? { model: String(b.model) } : {}) };
        const answer = await generateAnswer(cfg, view, view.aiRequestJson, loadProfile(), {}, view.notes);
        const selections = view.kind === "quiz" ? parseQuizSelections(answer, view.questions) : [];
        const rec = saveAnswerVersion(id, answer, "ai", undefined, selections);
        return json(res, 200, { answer, current: rec, history: rec.history, updatedAt: rec.updatedAt });
      }
      if (url === "/api/answer/stream") {
        // SSE: delta events while generating, then a final done event
        const b = await readBody(req);
        const id = Number(b.id);
        const view = findView(id);
        const cfg = { ...loadAiConfig(), ...(b.model ? { model: String(b.model) } : {}) };

        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        const sendEvent = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
        sendEvent({ type: "start" });
        try {
          const answer = await generateAnswer(cfg, view, view.aiRequestJson, loadProfile(), {
            onDelta: (delta) => {
              sendEvent({ type: "delta", delta });
              if (typeof (res as import("node:http").ServerResponse & { flush?: () => void }).flush === "function") {
                try {
                  (res as import("node:http").ServerResponse & { flush?: () => void }).flush?.();
                } catch {
                  /* ignore */
                }
              }
            },
          }, view.notes);
          const selections = view.kind === "quiz" ? parseQuizSelections(answer, view.questions) : [];
          const rec = saveAnswerVersion(id, answer, "ai", undefined, selections);
          sendEvent({ type: "done", answer, current: rec, history: rec.history });
          res.end();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendEvent({ type: "error", error: message });
          res.end();
        }
        return;
      }
      if (url === "/api/send") {
        const b = await readBody(req);
        const id = Number(b.id);
        const answer = String(b.answer ?? "");
        const view = findView(id);
        if (view.status === "done") return json(res, 400, { error: "Esta atividade já está concluída." });
        if (!answer.trim()) return json(res, 400, { error: "Escreva a resposta antes de enviar." });
        const env = sendEnv();
        if (!env.enabled) return json(res, 503, { error: env.reason });
        const selections = view.kind === "quiz" ? parseQuizSelections(answer, view.questions) : [];
        if (view.kind === "quiz" && selections.length === 0)
          return json(res, 400, { error: "Não foi possível identificar as alternativas escolhidas na resposta." });
        saveAnswerVersion(id, answer, "manual", undefined, selections);
        try {
          const submission =
            view.kind === "quiz"
              ? launchQuizSubmit(view, selections)
              : launchUploadSubmit(view, answer, "txt");
          return json(res, 200, { ok: true, submission: { status: submission.status, detail: submission.detail, at: submission.at } });
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    if (url.startsWith("/api/export/")) {
      const id = Number(url.split("/")[3]);
      const view = enrich(loadExercises(), loadAnswers(), loadOverrides()).find((x) => x.id === id && !x.hidden);
      if (!view || !view.answer) return json(res, 404, { error: "no answer yet" });
      const md = `# ${view.title}\n\n${view.answer}\n`;
      res.writeHead(200, {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${view.id}-answer.md"`,
      });
      return res.end(md);
    }

    // /scraped/** → local study data + downloaded files (PDFs open natively)
    if (url.startsWith("/scraped/")) {
      const rel = url.replace(/^\/scraped\/?/, "");
      const file = path.normalize(path.join(dataDir(), rel));
      if (!file.startsWith(path.normalize(dataDir()))) {
        res.writeHead(403).end("forbidden");
        return;
      }
      return sendStatic(res, file);
    }

    // served static build (SPA)
    if (url === "/" || url.startsWith("/assets")) {
      const file = path.join(DIST, url === "/" ? "index.html" : url);
      return sendStatic(res, file, path.join(DIST, "index.html"));
    }
    sendStatic(res, path.join(DIST, url), path.join(DIST, "index.html"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) return json(res, 500, { error: message });
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n🎓 LXP Homework → http://localhost:${PORT}`);
  console.log(`   data: ${dataDir()}`);
  console.log(`   ai config: ${assist("config", "ai-config.json")}\n`);
});

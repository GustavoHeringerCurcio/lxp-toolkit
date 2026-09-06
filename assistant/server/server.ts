import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { ASSISTANT_DIR, dataDir, assist } from "../src/paths.js";
import { loadExercises } from "../src/build.js";
import {
  loadAiConfig,
  loadAnswers,
  loadOverrides,
  saveAnswer,
  saveOverrides,
} from "../src/config.js";
import { enrich } from "../src/view.js";
import { generateAnswer } from "../src/ai.js";
import { launchUploadSubmit, lastSubmission, sendEnv } from "../src/send.js";

const DIST = path.join(ASSISTANT_DIR, "web", "dist");
const PORT = Number(process.env.PORT || 4174);

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
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

const server = createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  const method = req.method ?? "GET";

  // data for the app
  const allViews = () => enrich(loadExercises(), loadAnswers(), loadOverrides()).filter((v) => !v.hidden);
  if (url === "/api/exercises") {
    try {
      return json(res, 200, { generatedAt: new Date().toISOString(), exercises: allViews() });
    } catch (err) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (url === "/api/config") {
    const cfg = loadAiConfig();
    return json(res, 200, { model: cfg.model, language: cfg.language, configPath: assist("config", "ai-config.json") });
  }

  // portal send support
  if (url === "/api/send/config") {
    const env = sendEnv();
    return json(res, 200, { enabled: env.enabled, reason: env.reason });
  }
  if (url.startsWith("/api/send/preview")) {
    const id = Number(new URL(req.url ?? "/", "http://local").searchParams.get("id"));
    const view = allViews().find((x) => x.id === id);
    if (!view) return json(res, 404, { error: `exercise ${id} not found` });
    const canSubmit = view.kind === "upload" && view.status !== "done";
    return json(res, 200, {
      ok: canSubmit,
      reason: !canSubmit
        ? view.status === "done"
          ? "Esta atividade já está concluída."
          : "Só é possível enviar por aqui tarefas do tipo arquivo (upload). Questionários precisam ser respondidos no portal."
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
    return json(res, 200, { submission: last ?? null });
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
    if (url === "/api/answer/manual") {
      const b = await readBody(req);
      const id = Number(b.id);
      const answer = String(b.answer ?? "").trim();
      if (!id || !answer) return json(res, 400, { error: "answer required" });
      saveAnswer(id, answer, "manual");
      return json(res, 200, { ok: true, updatedAt: new Date().toISOString() });
    }
    if (url === "/api/answer") {
      const b = await readBody(req);
      const id = Number(b.id);
      const view = allViews().find((x) => x.id === id);
      if (!view) return json(res, 404, { error: `exercise ${id} not found` });
      try {
        const cfg = { ...loadAiConfig(), ...(b.model ? { model: String(b.model) } : {}) };
        const answer = await generateAnswer(cfg, view, view.notes);
        saveAnswer(id, answer, "ai");
        return json(res, 200, { answer, updatedAt: new Date().toISOString() });
      } catch (err) {
        return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (url === "/api/send") {
      const b = await readBody(req);
      const id = Number(b.id);
      const answer = String(b.answer ?? "");
      const view = allViews().find((x) => x.id === id);
      if (!view) return json(res, 404, { error: `exercise ${id} not found` });
      if (view.status === "done") return json(res, 400, { error: "Esta atividade já está concluída." });
      if (view.kind !== "upload")
        return json(res, 400, { error: "Só é possível enviar por aqui tarefas do tipo arquivo (upload)." });
      if (!answer.trim()) return json(res, 400, { error: "Escreva a resposta antes de enviar." });
      const env = sendEnv();
      if (!env.enabled) return json(res, 503, { error: env.reason });
      saveAnswer(id, answer, "manual");
      try {
        const submission = launchUploadSubmit(view, answer, "md");
        return json(res, 200, { ok: true, submission: { status: submission.status, detail: submission.detail, at: submission.at } });
      } catch (err) {
        return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  if (url.startsWith("/api/export/")) {
    const id = Number(url.split("/")[3]);
    const view = enrich(loadExercises(), loadAnswers(), loadOverrides()).find((x) => x.id === id);
    if (!view || !view.answer) return json(res, 404, { error: "no answer yet" });
    const md = `# ${view.title}\n\n${view.answer}\n`;
    res.writeHead(200, {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${view.id}-answer.md"`,
    });
    return res.end(md);
  }

  // /docs/** → study repo data + downloaded files (PDFs open natively)
  if (url.startsWith("/docs/")) {
    const rel = url.replace(/^\/docs\/?/, "");
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
});

server.listen(PORT, () => {
  console.log(`\n🎓 LXP Assistant → http://localhost:${PORT}`);
  console.log(`   data: ${dataDir()}`);
  console.log(`   ai config: ${assist("config", "ai-config.json")}\n`);
});

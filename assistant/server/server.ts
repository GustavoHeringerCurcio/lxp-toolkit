import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { ASSISTANT_DIR, dataDir, assist } from "../src/paths.js";
import { loadExercises } from "../src/build.js";
import { loadAiConfig, loadAnswers, loadOverrides, saveAnswers, saveOverrides } from "../src/config.js";
import { enrich } from "../src/view.js";
import { generateAnswer } from "../src/ai.js";

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
  if (url === "/api/exercises") {
    try {
      const views = enrich(loadExercises(), loadAnswers(), loadOverrides());
      return json(res, 200, { generatedAt: new Date().toISOString(), exercises: views.filter((v) => !v.hidden) });
    } catch (err) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (url === "/api/config") {
    const cfg = loadAiConfig();
    return json(res, 200, { model: cfg.model, language: cfg.language, configPath: assist("config", "ai-config.json") });
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
    if (url === "/api/answer") {
      const b = await readBody(req);
      const id = Number(b.id);
      const view = enrich(loadExercises(), loadAnswers(), loadOverrides()).find((x) => x.id === id);
      if (!view) return json(res, 404, { error: `exercise ${id} not found` });
      try {
        const cfg = { ...loadAiConfig(), ...(b.model ? { model: String(b.model) } : {}) };
        const answer = await generateAnswer(cfg, view, view.notes);
        const answers = loadAnswers();
        answers[String(id)] = { answer, updatedAt: new Date().toISOString() };
        saveAnswers(answers);
        return json(res, 200, { answer, updatedAt: answers[String(id)].updatedAt });
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

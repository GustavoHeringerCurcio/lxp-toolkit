import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { ASSISTANT_DIR, assist, dataDir, raw, openaiKeyLast4, openaiKeySource } from "../src/paths.js";
import { isAuthorized, toolkitToken } from "../src/auth.js";
import { createRefreshController } from "../src/refresh.js";
import { loadExercises, ASSISTANT_EXERCISES_FILE } from "../src/build.js";
import { healthCheck, query, runMigrations } from "../src/db.js";
import { importAll } from "../src/import.js";
import { ensureContentText } from "../src/extract.js";
import { getCatalogVersion, readProjectionMeta, writeProjection } from "../src/project.js";
import {
  clearAnswerHistory,
  deleteProfessorLink,
  getAiConfig,
  getActivityAbilities,
  getAnswerRecord,
  getActivityProject,
  getAnswers,
  getCurrentAttemptId,
  getDebugLog,
  getOverrides,
  getProfessorLinks,
  getProfile,
  getProjectProfile,
  getProjectSource,
  listDebugLogs,
  listProjectSourceFiles,
  recordAiRun,
  restoreAnswerVersion,
  saveActivityProject,
  saveAiConfig,
  saveAiRequest,
  saveAnswerGate,
  saveAnswerVersion,
  saveAutoFlavor,
  saveNote,
  saveProfessorLink,
  saveProfile,
  saveProjectProfile,
  saveProjectSource,
  saveProjectSourceReadme,
  saveTag,
  setActivityAbility,
} from "../src/store.js";
import {
  buildSubjectContext,
  generateStudyGuide,
  generateTrainingQuiz,
  listTrainingSubjects,
  subjectLabel,
} from "../src/training.js";
import {
  completeTrainingQuiz,
  createTrainingQuiz,
  getTrainingStats,
  type TrainingAnswerInput,
} from "../src/training-store.js";
import { generateResumo } from "../src/summary.js";
import { getStudySummary, saveStudySummary } from "../src/summary-store.js";
import { enrich, type ExerciseView } from "../src/view.js";
import { generateAnswer } from "../src/ai.js";
import { classifyFlavor } from "../src/classify.js";
import {
  analyzeActivity,
  buildProjectInstructionBlock,
  composeEffectiveInstructions,
  isProjectConfident,
  projectFormatHint,
  resolveProjectContext,
} from "../src/project-context.js";
import { humanizeQuizAnswer, parseQuizSelections, composeGhostAnswer } from "../src/prompt.js";
import { analyzeDraftQuality } from "../src/gate.js";
import { ABILITY_REGISTRY, isAbilityId, mergeAbilities } from "../src/abilities.js";
import { gateLogReason, shouldLog, writeDebugLog, type DebugProject } from "../src/debug-log.js";
import { findTemplateDocx } from "../src/template.js";
import type {
  AiActivitySections,
  AiConfig,
  AiModels,
  AiStyle,
  AnswerRecord,
  GateResult,
  QuizQ,
  QuizSelection,
} from "../src/types.js";
import {
  launchUploadSubmit,
  launchQuizSubmit,
  launchMarkComplete,
  launchForumSubmit,
  lastSubmission,
  sendEnv,
  submissionsFor,
  uploadBaseName,
  saveUploadedImage,
  findUploadedImage,
  IMAGE_MIME_TO_EXT,
  type SendMode,
} from "../src/send.js";
import { officeToPdf, previewCacheDir } from "../src/office.js";
import { answerToPdf } from "../src/pdf.js";
import { renderFilledDocx } from "../src/docx.js";
import { generateDiagramSpec, renderDiagramPng } from "../src/diagram.js";
import { buildDiagram } from "../src/diagram-tool.js";
import { applyTemplateDefaults, forceTodayDate, parseUseCases, type UseCase } from "../src/usecase.js";
import { parseLinkedinUrl } from "../src/linkedin.js";
import { buildOrgDirectory, loadOrganizations, matchOrganization } from "../src/organizations.js";
import {
  PROJECT_FILE_MAX_BYTES,
  addProjectFile,
  fetchGithubReadme,
  removeProjectFile,
} from "../src/project-source.js";

const DIST = path.join(ASSISTANT_DIR, "..", "web", "dist");
const PORT = Number(process.env.PORT || 4174);

/** Scrape fresh portal content, then rebuild the assistant's list. */
const refresh = createRefreshController({
  repoRoot: path.resolve(ASSISTANT_DIR, "..", ".."),
  assistantDir: ASSISTANT_DIR,
});

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

/** Safe attachment filename (matches the runner's sanitizer), forced to `ext`. */
function safeFilename(name: string, ext: string): string {
  const base = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
  return `${base || "resposta"}.${ext}`;
}

/**
 * Build the filled `.docx` for a template activity (a .docx model attached to
 * the task), pouring the parsed use cases into a clone of the model table.
 * Returns `{ error }` when the task has no model or the answer has no cases.
 */
async function buildFilledDocx(
  view: ExerciseView,
  answer: string,
): Promise<{ buffer: Buffer; filename: string } | { error: string }> {
  const template = await findTemplateDocx(view.files);
  if (!template) return { error: "Esta atividade não tem um modelo .docx para preencher." };
  const labels = template.fields.map((f) => f.label);
  // Parse against the .docx labels plus the labels the detection model read from
  // the activity, so the draft and the filled document stay consistent.
  const activity = await getActivityProject(view.id).catch(() => null);
  const detected = activity?.templateFields ?? [];
  const parseLabels = detected.length ? [...new Set([...labels, ...detected])] : labels;
  const profile = await getProfile().catch(() => null);
  const cases = applyTemplateDefaults(parseUseCases(answer, parseLabels), profile ?? {});
  if (!cases.length) {
    return {
      error: "Não foi possível identificar os casos de uso na resposta. Gere a resposta novamente.",
    };
  }
  const systemName = await resolveSystemName(view);
  const diagramPng = await buildDiagramPng(view, cases, systemName).catch(() => null);
  const buffer = await renderFilledDocx(template.path, labels, cases, diagramPng);
  return { buffer, filename: safeFilename(await uploadBaseName(view), "docx") };
}

/**
 * The UML system boundary label: the course main project wins (template
 * activities are grounded in it), then the student's declared project
 * ("Meu projeto"), then the course name as a last resort.
 */
async function resolveSystemName(view: ExerciseView): Promise<string> {
  try {
    const main = await getProjectProfile(view.courseId);
    if (main?.theme.trim()) return main.theme.trim();
  } catch {
    /* best-effort */
  }
  try {
    const source = await getProjectSource();
    if (source.title.trim()) return source.title.trim();
  } catch {
    /* best-effort */
  }
  return view.courseName;
}

/** Infer the UML diagram model and rasterize it to PNG (null when unavailable). */
async function buildDiagramPng(
  view: ExerciseView,
  cases: UseCase[],
  systemName: string,
): Promise<Buffer | null> {
  const cfg = await getAiConfig();
  const spec = await generateDiagramSpec(cfg, cases, systemName);
  return renderDiagramPng(spec);
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

/** Load answers + overrides + professor photos from Postgres and enrich the cached exercises. */
async function loadViews(): Promise<ExerciseView[]> {
  const [answers, overrides, professorLinks, orgDirectory] = await Promise.all([
    getAnswers(),
    getOverrides(),
    getProfessorLinks(),
    buildOrgDirectory(),
  ]);
  return enrich(loadExercises(), answers, overrides, professorLinks, orgDirectory);
}

/** Look up an enriched, non-hidden exercise view or throw a clear error. */
async function findView(id: number): Promise<ExerciseView> {
  const view = (await loadViews()).find((x) => x.id === id && !x.hidden);
  if (!view) throw new Error(`exercício ${id} não encontrado`);
  return view;
}

async function allViews(): Promise<ExerciseView[]> {
  return (await loadViews()).filter((v) => !v.hidden);
}

interface GateContext {
  contentItemId: number;
  answerAttemptId: number | null;
  project: DebugProject | null;
  templateFields: string[];
  model: string;
  prompt: string;
  promptHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

/**
 * Run the quality gate for a just-saved draft and persist it. Detached from the
 * request path: never throws, so generation is never affected. When the draft is
 * not ready to send, a full-context debug log is written.
 */
async function runGateAndLog(
  cfg: AiConfig,
  view: ExerciseView,
  shown: string,
  ctx: GateContext,
): Promise<GateResult | null> {
  try {
    const gate = await analyzeDraftQuality(cfg, view, shown);
    if (!gate) return null;
    if (shouldLog(gate)) {
      const written = await writeDebugLog({
        contentItemId: ctx.contentItemId,
        answerAttemptId: ctx.answerAttemptId,
        reason: gateLogReason(gate) ?? "gate",
        activity: {
          title: view.title,
          kind: view.kind,
          courseName: view.courseName,
          moduleTitle: view.moduleTitle,
          instructionsText: view.instructionsText ?? "",
          files: view.files.map((f) => f.name),
        },
        project: ctx.project,
        templateFields: ctx.templateFields,
        abilities: cfg.abilities ?? {},
        generation: {
          model: ctx.model,
          temperature: cfg.temperature,
          prompt: ctx.prompt,
          completion: shown,
          promptHash: ctx.promptHash,
          tokensIn: ctx.tokensIn,
          tokensOut: ctx.tokensOut,
        },
        gate,
        createdAt: new Date().toISOString(),
      }).catch(() => null);
      gate.logged = Boolean(written && (written.id || written.file));
    }
    await saveAnswerGate(ctx.contentItemId, gate);
    return gate;
  } catch {
    /* gate is best-effort */
    return null;
  }
}

/**
 * Generate an AI answer, persist it as an immutable attempt (with model +
 * prompt provenance) and record an `ai_run`.
 */
async function generateAndSave(
  id: number,
  view: ExerciseView,
  opts: { onDelta?: (delta: string) => void; model?: string } = {},
): Promise<{ shown: string; rec: AnswerRecord; gate: Promise<GateResult | null> }> {
  const cfg = { ...(await getAiConfig()), ...(opts.model ? { model: opts.model } : {}) };
  const profile = await getProfile();
  const startedAt = Date.now();

  // Ground the generation in the activity's project context (when enabled).
  // For template-fill activities the course MAIN project is the source of truth;
  // otherwise the student's declared project ("Meu projeto") still wins.
  let projectBlock = "";
  let externalBlock = "";
  let wantsTemplate = false;
  let templateFields: string[] = [];
  let projectInfo: DebugProject | null = null;
  if (cfg.projectAutoDetect !== false && isAnswerable(view)) {
    try {
      const analysis = await analyzeActivity(cfg, view, { notes: view.notes ?? "" });
      wantsTemplate = analysis.wantsTemplate;
      templateFields = analysis.templateFields;
      if (wantsTemplate) {
        const main = analysis.mainProfile;
        if (main && isProjectConfident(main)) {
          projectBlock = buildProjectInstructionBlock({
            theme: main.theme,
            atores: main.atores,
            requisitos: main.requisitos,
            origin: "main",
          });
        }
        projectInfo = {
          theme: main?.theme ?? "",
          atores: main?.atores ?? [],
          requisitos: main?.requisitos ?? [],
          origin: main ? "main" : null,
          confidence: main?.confidence ?? analysis.confidence ?? null,
          source: analysis.source ?? null,
          model: analysis.activity.model ?? null,
          intent: analysis.intent ?? null,
          reason: analysis.reason ?? null,
          needsProject: analysis.needsProject,
        };
      } else {
        const resolved = await resolveProjectContext(cfg, view, { notes: view.notes ?? "" });
        if (resolved.effective) projectBlock = buildProjectInstructionBlock(resolved.effective);
        externalBlock = resolved.external;
        projectInfo = resolved.effective
          ? {
              theme: resolved.effective.theme,
              atores: resolved.effective.atores,
              requisitos: resolved.effective.requisitos,
              origin: resolved.effective.origin,
              confidence: analysis.confidence ?? null,
              source: analysis.source ?? null,
              model: analysis.activity.model ?? null,
              intent: analysis.intent ?? null,
              reason: analysis.reason ?? null,
              needsProject: analysis.needsProject,
            }
          : null;
      }
    } catch {
      /* project context is best-effort */
    }
  }
  // A professor-provided model (docx table) or a detected template supersedes the
  // generic "fill a Markdown table" hint — the structured contract takes over.
  const template = view.kind === "upload" ? await findTemplateDocx(view.files).catch(() => null) : null;
  const extra = composeEffectiveInstructions(
    view.aiRequestJson,
    wantsTemplate ? "" : projectBlock,
    wantsTemplate ? "" : externalBlock,
    template || wantsTemplate ? "" : projectFormatHint(view),
  );

  const gen = await generateAnswer(
    cfg,
    view,
    extra,
    profile,
    { onDelta: opts.onDelta, wantsTemplate, templateFields, projectBlock },
    view.notes,
  );
  const selections = view.kind === "quiz" ? parseQuizSelections(gen.text, view.questions) : [];
  // Never let the model's guessed date leak into a filled template draft.
  const finalText = wantsTemplate ? forceTodayDate(gen.text) : gen.text;
  const shown = view.kind === "quiz" ? humanizeQuizAnswer(finalText, view.questions) : finalText;
  const rec = await saveAnswerVersion(id, shown, "ai", undefined, selections, {
    model: gen.model,
    promptHash: gen.promptHash,
  });
  const attemptId = await getCurrentAttemptId(id);
  await recordAiRun({
    contentItemId: id,
    prompt: gen.prompt,
    promptHash: gen.promptHash,
    completion: shown,
    model: gen.model,
    tokensIn: gen.tokensIn,
    tokensOut: gen.tokensOut,
    latencyMs: Date.now() - startedAt,
    answerAttemptId: attemptId,
  }).catch(() => undefined);

  // Quality gate: runs automatically on every generation (advisory; never
  // blocks sending) and is persisted with the answer version. It is detached
  // from the response path so the draft is delivered immediately, but the
  // promise is returned so callers can forward the result to the client
  // (streaming sends a `gate` event) instead of the client re-analyzing.
  const gate = runGateAndLog(cfg, view, shown, {
    contentItemId: id,
    answerAttemptId: attemptId,
    project: projectInfo,
    templateFields,
    model: gen.model,
    prompt: gen.prompt,
    promptHash: gen.promptHash,
    tokensIn: gen.tokensIn,
    tokensOut: gen.tokensOut,
  });
  return { shown, rec, gate };
}

/** Tasks, quizzes and forums with a real question have AI-answerable content. */
function isAnswerable(view: { kind: string; flavor: string }): boolean {
  return (
    view.flavor === "question" &&
    (view.kind === "upload" || view.kind === "quiz" || view.kind === "forum")
  );
}

/**
 * Validate selections sent by the web app (they already carry the portal
 * optionId). Returns only entries whose question/option exist, falling back to
 * parsing the humanized answer text when none are usable.
 */
function coerceSelections(raw: unknown, questions: QuizQ[]): QuizSelection[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: QuizSelection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const questionId = Number(o.questionId);
    const q = byId.get(questionId);
    if (!q) continue;
    const optionId = Number(o.optionId);
    let optionIndex = Number(o.optionIndex);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= q.options.length) {
      optionIndex = q.options.findIndex((opt) => opt.id === optionId);
    }
    if (optionIndex < 0 || optionIndex >= q.options.length) continue;
    out.push({
      questionId,
      optionIndex,
      letter: String.fromCharCode(97 + optionIndex),
      optionId: q.options[optionIndex].id,
    });
  }
  return out;
}

const server = createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  const method = req.method ?? "GET";

  try {
    // Optional CORS (only when a browser calls the backend directly, bypassing
    // the Vercel proxy). The proxy itself is same-origin, so this stays off.
    const allowOrigin = process.env.ALLOWED_ORIGIN?.trim();
    if (allowOrigin && url.startsWith("/api/")) {
      res.setHeader("access-control-allow-origin", allowOrigin);
      res.setHeader("access-control-allow-headers", "authorization, content-type, x-toolkit-token");
      res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
      if (method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
    }

    // Unauthenticated liveness probe (Vercel proxy + uptime checks + cron).
    if (url === "/api/health") {
      return json(res, 200, { ok: true, time: new Date().toISOString() });
    }

    // When TOOLKIT_TOKEN is configured, the API and the scraped files are
    // private: every request must carry the shared secret. Unset = local mode.
    if ((url.startsWith("/api/") || url.startsWith("/scraped/")) && !isAuthorized(req)) {
      return json(res, 401, { error: "não autorizado" });
    }

    if (url === "/api/exercises") {
      return json(res, 200, { generatedAt: new Date().toISOString(), exercises: await allViews() });
    }
    if (url === "/api/preview" && (method === "GET" || method === "HEAD")) {
      const src = new URL(req.url ?? "/", "http://local").searchParams.get("url") ?? "";
      if (!src) return json(res, 400, { error: "url obrigatória" });
      return await servePreview(res, src, method === "HEAD");
    }
    if (url === "/api/config") {
      const cfg = await getAiConfig();
      return json(res, 200, {
        model: cfg.model,
        models: cfg.models,
        max_output_tokens: cfg.max_output_tokens,
        temperature: cfg.temperature,
        configPath: "Postgres · ai_config",
        style: cfg.style,
        activitySections: cfg.activitySections,
        projectAutoDetect: cfg.projectAutoDetect ?? true,
        abilities: cfg.abilities,
        abilityRegistry: ABILITY_REGISTRY,
        profile: await getProfile(),
      });
    }
    if (url === "/api/refresh/status") {
      return json(res, 200, refresh.status());
    }
    if (url === "/api/profile" && method === "GET") {
      return json(res, 200, await getProfile());
    }

    // organizations (hardcoded directory; avatars load from unavatar in the browser)
    if (url === "/api/organizations" && method === "GET") {
      const orgs = loadOrganizations();
      const selectedHost =
        (await query<{ host: string | null }>("SELECT host FROM institution ORDER BY id LIMIT 1"))[0]
          ?.host ?? null;
      const organizations = await Promise.all(
        orgs.map(async (o, index) => ({
          id: o.id,
          name: o.name,
          host: o.host,
          logo: o.logo,
          selected: selectedHost ? o.host === selectedHost : index === 0,
          professors: await matchOrganization(o),
        })),
      );
      return json(res, 200, { organizations });
    }

    // professor photos (per student; stored LinkedIn/manual URL, no server download)
    if (url === "/api/professor-links" && method === "GET") {
      return json(res, 200, { links: await getProfessorLinks() });
    }
    if (url === "/api/professor-link" && method === "POST") {
      const b = await readBody(req);
      const professorId = Number(b.professorId);
      if (!professorId) return json(res, 400, { error: "professorId obrigatório" });
      const rawLinkedin = b.linkedinUrl == null ? "" : String(b.linkedinUrl).trim();
      const rawImage = b.imageUrl == null ? "" : String(b.imageUrl).trim();

      let linkedinUrl: string | null = null;
      if (rawLinkedin) {
        const parsed = parseLinkedinUrl(rawLinkedin);
        if (!parsed) return json(res, 400, { error: "URL do LinkedIn inválida." });
        linkedinUrl = parsed.url;
      }
      if (!linkedinUrl && !rawImage) {
        await deleteProfessorLink(professorId);
        return json(res, 200, { ok: true, removed: true, link: null });
      }

      const saved = await saveProfessorLink(professorId, { linkedinUrl, imageUrl: rawImage || null });
      return json(res, 200, { ok: true, link: saved });
    }
    if (url.startsWith("/api/professor-link/") && method === "DELETE") {
      const professorId = Number(url.split("/")[3]);
      if (!professorId) return json(res, 400, { error: "professorId obrigatório" });
      await deleteProfessorLink(professorId);
      return json(res, 200, { ok: true });
    }

    // answers / history
    if (url.startsWith("/api/answer/") && url.endsWith("/restore") && method === "POST") {
      const seg = url.split("/");
      const id = Number(seg[3]);
      const b = await readBody(req);
      const index = Number(b.index);
      if (!id || Number.isNaN(index)) return json(res, 400, { error: "id e index obrigatórios" });
      const rec = await restoreAnswerVersion(id, index);
      return json(res, 200, { current: rec, history: rec.history });
    }
    if (url.startsWith("/api/answer/") && url.endsWith("/history") && method === "DELETE") {
      const id = Number(url.split("/")[3]);
      const rec = await clearAnswerHistory(id);
      return json(res, 200, { current: rec, history: rec.history });
    }
    if (url.startsWith("/api/answer/") && method === "GET") {
      const id = Number(url.split("/")[3]);
      const rec = await getAnswerRecord(id);
      return json(res, 200, {
        current: rec ? { answer: rec.answer, updatedAt: rec.updatedAt, source: rec.source } : null,
        history: rec?.history ?? [],
      });
    }

    // training ("Treino")
    if (url === "/api/training/subjects" && method === "GET") {
      return json(res, 200, { subjects: await listTrainingSubjects() });
    }
    if (url === "/api/training/stats" && method === "GET") {
      return json(res, 200, await getTrainingStats());
    }
    if (url === "/api/training/quiz" && method === "POST") {
      const b = await readBody(req);
      const courseId = Number(b.courseId);
      if (!courseId) return json(res, 400, { error: "courseId obrigatório" });
      const moduleId = b.moduleId != null && b.moduleId !== "" ? Number(b.moduleId) : null;
      const mode = b.mode === "mixed" ? "mixed" : "ai";
      const count = Math.min(30, Math.max(5, Number(b.count) || 10));
      const startedAt = Date.now();
      const ctx = await buildSubjectContext(courseId, moduleId);
      const generated = await generateTrainingQuiz(ctx, mode, count);
      const quiz = await createTrainingQuiz({
        courseId,
        moduleId: moduleId ?? null,
        mode,
        title: generated.title,
        subjectLabel: subjectLabel(ctx),
        questions: generated.questions,
      });
      for (const p of generated.provenances) {
        await recordAiRun({
          contentItemId: null,
          prompt: p.prompt,
          promptHash: p.promptHash,
          completion: JSON.stringify({ title: generated.title, count: generated.questions.length }),
          model: p.model,
          tokensIn: p.tokensIn,
          tokensOut: p.tokensOut,
          latencyMs: Date.now() - startedAt,
          answerAttemptId: null,
        }).catch(() => undefined);
      }
      return json(res, 200, quiz);
    }
    if (url.startsWith("/api/training/quiz/") && url.endsWith("/complete") && method === "POST") {
      const id = Number(url.split("/")[4]);
      if (!id) return json(res, 400, { error: "id obrigatório" });
      const b = await readBody(req);
      const answers: TrainingAnswerInput[] = Array.isArray(b.answers)
        ? b.answers
            .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
            .map((a) => ({
              questionId: Number(a.questionId),
              chosenIndex: a.chosenIndex == null ? null : Number(a.chosenIndex),
              isCorrect: a.isCorrect === true,
            }))
            .filter((a) => Number.isFinite(a.questionId))
        : [];
      const score = Math.max(0, Number(b.score) || 0);
      await completeTrainingQuiz(id, answers, score);
      return json(res, 200, { ok: true });
    }
    if (url === "/api/training/study" && method === "POST") {
      const b = await readBody(req);
      const courseId = Number(b.courseId);
      const question = String(b.query ?? "").trim();
      if (!courseId) return json(res, 400, { error: "courseId obrigatório" });
      if (!question) return json(res, 400, { error: "Escreva uma pergunta." });
      const moduleId = b.moduleId != null && b.moduleId !== "" ? Number(b.moduleId) : null;

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const sendEvent = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      sendEvent({ type: "start" });
      const startedAt = Date.now();
      try {
        const ctx = await buildSubjectContext(courseId, moduleId);
        const result = await generateStudyGuide(ctx, question, (delta) => {
          sendEvent({ type: "delta", delta });
          if (typeof (res as import("node:http").ServerResponse & { flush?: () => void }).flush === "function") {
            try {
              (res as import("node:http").ServerResponse & { flush?: () => void }).flush?.();
            } catch {
              /* ignore */
            }
          }
        });
        await recordAiRun({
          contentItemId: null,
          prompt: result.provenance.prompt,
          promptHash: result.provenance.promptHash,
          completion: result.text,
          model: result.provenance.model,
          tokensIn: result.provenance.tokensIn,
          tokensOut: result.provenance.tokensOut,
          latencyMs: Date.now() - startedAt,
          answerAttemptId: null,
        }).catch(() => undefined);
        sendEvent({ type: "done", answer: result.text });
        res.end();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendEvent({ type: "error", error: message });
        res.end();
      }
      return;
    }

    // resumo ("study summary")
    if (url === "/api/summary" && method === "GET") {
      const params = new URL(req.url ?? "/", "http://local").searchParams;
      const courseId = Number(params.get("courseId"));
      if (!courseId) return json(res, 400, { error: "courseId obrigatório" });
      const moduleParam = params.get("moduleId");
      const summary = await getStudySummary(courseId, moduleParam ? Number(moduleParam) : null);
      return json(res, 200, { summary });
    }
    if (url === "/api/summary" && method === "POST") {
      const b = await readBody(req);
      const courseId = Number(b.courseId);
      if (!courseId) return json(res, 400, { error: "courseId obrigatório" });
      const moduleId = b.moduleId != null && b.moduleId !== "" ? Number(b.moduleId) : null;

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const sendEvent = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      const flushEvent = () => {
        const r = res as import("node:http").ServerResponse & { flush?: () => void };
        if (typeof r.flush === "function") {
          try {
            r.flush?.();
          } catch {
            /* ignore */
          }
        }
      };
      sendEvent({ type: "start" });
      const startedAt = Date.now();
      try {
        const ctx = await buildSubjectContext(courseId, moduleId);
        const generated = await generateResumo(ctx, {
          onStep: (step) => {
            sendEvent({ type: "step", ...step });
            flushEvent();
          },
          onDelta: (delta) => {
            sendEvent({ type: "delta", delta });
            flushEvent();
          },
        });
        for (const p of generated.provenances) {
          await recordAiRun({
            contentItemId: null,
            prompt: p.prompt,
            promptHash: p.promptHash,
            completion: generated.content,
            model: p.model,
            tokensIn: p.tokensIn,
            tokensOut: p.tokensOut,
            latencyMs: Date.now() - startedAt,
            answerAttemptId: null,
          }).catch(() => undefined);
        }
        const summary = await saveStudySummary({
          courseId,
          moduleId,
          subjectLabel: subjectLabel(ctx),
          content: generated.content,
          model: generated.model,
          promptHash: generated.promptHash,
          itemCount: generated.itemCount,
        });
        sendEvent({ type: "done", summary });
        res.end();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendEvent({ type: "error", error: message });
        res.end();
      }
      return;
    }

    // portal send support
    if (url === "/api/send/config") {
      const env = sendEnv();
      return json(res, 200, { enabled: env.enabled, reason: env.reason });
    }
    if (url.startsWith("/api/send/preview")) {
      const id = Number(new URL(req.url ?? "/", "http://local").searchParams.get("id"));
      const view = await findView(id);
      const canSubmit =
        (view.kind === "upload" || view.kind === "quiz" || view.kind === "forum") && view.status !== "done";
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
    if (url === "/api/send/artifact" && method === "POST") {
      const b = await readBody(req);
      const id = Number(b.id);
      const answer = String(b.answer ?? "");
      const mode = String(b.mode ?? "");
      const rich = mode === "fill";
      const isPdf = mode === "pdf" || rich;
      const download = b.download === true;
      if (!id) return json(res, 400, { error: "id obrigatório" });
      if (!answer.trim()) return json(res, 400, { error: "Escreva a resposta antes de gerar o arquivo." });
      const view = await findView(id);

      if (mode === "docx") {
        const built = await buildFilledDocx(view, answer);
        if ("error" in built) return json(res, 400, { error: built.error });
        res.writeHead(200, {
          "content-type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-length": built.buffer.length,
          "content-disposition": `${download ? "attachment" : "inline"}; filename="${built.filename}"`,
          "x-filename": built.filename,
          "cache-control": "no-store",
        });
        return res.end(built.buffer);
      }

      const baseName = await uploadBaseName(view);
      const ext = isPdf ? "pdf" : "txt";
      const filename = safeFilename(baseName, ext);
      const disposition = `${download ? "attachment" : "inline"}; filename="${filename}"`;

      if (isPdf) {
        const pdf = await answerToPdf(answer, baseName, { rich });
        if (!pdf) return json(res, 500, { error: "Não foi possível gerar o PDF (LibreOffice indisponível?)." });
        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-length": statSync(pdf).size,
          "content-disposition": disposition,
          "x-filename": filename,
          "cache-control": "no-store",
        });
        createReadStream(pdf).pipe(res);
        return;
      }

      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": disposition,
        "x-filename": filename,
        "cache-control": "no-store",
      });
      return res.end(answer);
    }
    if (url.startsWith("/api/send/") && method === "GET") {
      const id = Number(url.split("/")[3]);
      const [last, all] = await Promise.all([lastSubmission(id), submissionsFor(id)]);
      return json(res, 200, { submission: last ?? null, submissions: all });
    }
    if (url === "/api/project-profile" && method === "GET") {
      const courseId = Number(new URL(req.url ?? "/", "http://local").searchParams.get("courseId"));
      if (!courseId) return json(res, 400, { error: "courseId required" });
      const profile = await getProjectProfile(courseId);
      return json(res, 200, { profile });
    }
    if (url.startsWith("/api/activity-project/") && method === "GET") {
      const id = Number(url.split("/")[3]);
      if (!id) return json(res, 400, { error: "id required" });
      const activity = await getActivityProject(id);
      return json(res, 200, { activity });
    }
    if (url.startsWith("/api/activity-abilities/") && method === "GET") {
      const id = Number(url.split("/")[3]);
      if (!id) return json(res, 400, { error: "id required" });
      const abilities = await getActivityAbilities(id);
      return json(res, 200, { abilities });
    }
    if (url === "/api/debug-logs" && method === "GET") {
      return json(res, 200, { logs: await listDebugLogs(50) });
    }
    if (url.startsWith("/api/debug-log/") && method === "GET") {
      const id = Number(url.split("/")[3]);
      if (!id) return json(res, 400, { error: "id required" });
      const log = await getDebugLog(id);
      if (!log) return json(res, 404, { error: "log não encontrado" });
      return json(res, 200, { log });
    }

    // external project source (Ajustes → Organização): repo + uploaded files
    if (url === "/api/project-source" && method === "GET") {
      const [source, files] = await Promise.all([getProjectSource(), listProjectSourceFiles()]);
      return json(res, 200, { source, files });
    }
    if (url.startsWith("/api/project-source/file/") && method === "DELETE") {
      const id = Number(url.split("/")[4]);
      if (!id) return json(res, 400, { error: "id obrigatório" });
      const removed = await removeProjectFile(id);
      return json(res, 200, { ok: removed });
    }

    if (method === "POST") {
      if (url === "/api/note") {
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        await saveNote(id, String(b.notes ?? ""));
        return json(res, 200, { ok: true });
      }
      if (url === "/api/ai-request") {
        // save per-exercise AiRequest override (or clear when raw is null)
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        await saveAiRequest(id, b.raw == null ? null : String(b.raw));
        const view = await findView(id);
        return json(res, 200, { ok: true, aiRequestJson: view.aiRequestJson, hasAiOverride: view.hasAiOverride });
      }
      if (url === "/api/context/analyze") {
        // Lazy project-context analysis: relevance + main/quick profile.
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const view = await findView(id);
        const cfg = await getAiConfig();
        try {
          const result = await analyzeActivity(cfg, view, {
            notes: view.notes ?? "",
            forceProfile: b.forceProfile === true,
          });
          return json(res, 200, { ok: true, ...result });
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (url === "/api/project-profile") {
        // Manual edit of the course MAIN project (theme/actors/requirements).
        const b = await readBody(req);
        const courseId = Number(b.courseId);
        if (!courseId) return json(res, 400, { error: "courseId required" });
        const profile = await saveProjectProfile(courseId, {
          theme: b.theme != null ? String(b.theme) : undefined,
          atores: Array.isArray(b.atores) ? b.atores.map(String) : undefined,
          requisitos: Array.isArray(b.requisitos) ? b.requisitos.map(String) : undefined,
          suggestedThemes: Array.isArray(b.suggestedThemes) ? b.suggestedThemes.map(String) : undefined,
          source: "manual",
        });
        return json(res, 200, { ok: true, profile });
      }
      if (url === "/api/activity-project") {
        // Per-activity choice: use the main project, a quick project, or none.
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const mode = b.profileMode;
        const profileMode = mode === "activity" || mode === "none" || mode === "main" ? mode : undefined;
        const activity = await saveActivityProject(id, {
          needsProject: typeof b.needsProject === "boolean" ? b.needsProject : undefined,
          profileMode,
          theme: b.theme != null ? String(b.theme) : undefined,
          atores: Array.isArray(b.atores) ? b.atores.map(String) : undefined,
          requisitos: Array.isArray(b.requisitos) ? b.requisitos.map(String) : undefined,
          source: "manual",
        });
        return json(res, 200, { ok: true, activity });
      }
      if (url === "/api/activity-ability") {
        // Per-activity ability toggle: true/false sets an override, null clears it.
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        if (!isAbilityId(b.ability)) return json(res, 400, { error: "ability inválida" });
        const enabled = b.enabled === null ? null : b.enabled === true;
        const abilities = await setActivityAbility(id, b.ability, enabled);
        return json(res, 200, { ok: true, abilities });
      }
      if (url === "/api/project-source") {
        // Manual edit of the global project source (title/repo/notes).
        const b = await readBody(req);
        const source = await saveProjectSource({
          title: b.title != null ? String(b.title) : undefined,
          githubUrl: b.githubUrl != null ? String(b.githubUrl) : undefined,
          notes: b.notes != null ? String(b.notes) : undefined,
        });
        return json(res, 200, { ok: true, source });
      }
      if (url === "/api/project-source/fetch") {
        // Fetch the repo README (public; GITHUB_TOKEN enables private repos).
        const b = await readBody(req);
        const githubUrl = b.githubUrl != null ? String(b.githubUrl).trim() : (await getProjectSource()).githubUrl;
        if (!githubUrl) return json(res, 400, { error: "Informe a URL do repositório." });
        const result = await fetchGithubReadme(githubUrl);
        const source = await saveProjectSourceReadme(result.text, result.status);
        return json(res, 200, {
          ok: result.status === "ok",
          status: result.status,
          detail: result.detail,
          source,
        });
      }
      if (url === "/api/project-source/file") {
        // Receive a project file as base64 and extract its text (best-effort).
        const b = await readBody(req);
        const filename = String(b.filename ?? "").trim();
        if (!filename) return json(res, 400, { error: "filename obrigatório" });
        const rawData = String(b.data ?? "");
        const comma = rawData.indexOf(",");
        const buf = Buffer.from(comma >= 0 ? rawData.slice(comma + 1) : rawData, "base64");
        if (buf.length === 0) return json(res, 400, { error: "Arquivo vazio." });
        if (buf.length > PROJECT_FILE_MAX_BYTES) return json(res, 413, { error: "Arquivo grande demais (máx. 25 MB)." });
        const file = await addProjectFile({
          filename,
          mime: b.mime != null ? String(b.mime) : null,
          data: buf,
        });
        return json(res, 200, { ok: true, file });
      }
      if (url === "/api/tag") {
        // set/clear a manual anomaly tag (ghost | print | anomalia | null)
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const tag = b.tag == null ? null : String(b.tag).trim() || null;
        await saveTag(id, tag);
        const view = await findView(id);
        return json(res, 200, {
          ok: true,
          tag: view.tag,
          flavor: view.flavor,
          flavorSource: view.flavorSource,
          anomalies: view.anomalies,
        });
      }
      if (url === "/api/flavor/classify") {
        // Lazy AI review of an ambiguous upload task (called on open).
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const view = await findView(id);
        if (view.kind !== "upload" && view.kind !== "quiz" && view.kind !== "forum") {
          return json(res, 400, { error: "Esta atividade não aceita classificação." });
        }
        // Manual tag wins; a cached AI verdict is returned as-is.
        if (view.tag || view.flavorSource === "ai" || !view.needsReview) {
          return json(res, 200, {
            ok: true,
            classified: false,
            flavor: view.flavor,
            flavorSource: view.flavorSource,
            anomalies: view.anomalies,
          });
        }
        const cfg = await getAiConfig();
        const attachments = [
          ...view.files.map((f) => f.name),
          ...view.remoteFiles.map((r) => r.filename ?? r.url),
        ];
        const result = await classifyFlavor(cfg, {
          title: view.title,
          instructionsText: view.instructionsText,
          attachments,
        });
        if (!result) {
          return json(res, 200, {
            ok: true,
            classified: false,
            flavor: view.flavor,
            flavorSource: view.flavorSource,
            anomalies: view.anomalies,
          });
        }
        await saveAutoFlavor(id, result.flavor, result.reason, result.model);
        const updated = await findView(id);
        return json(res, 200, {
          ok: true,
          classified: true,
          flavor: updated.flavor,
          flavorSource: updated.flavorSource,
          anomalies: updated.anomalies,
          reason: result.reason,
        });
      }
      if (url === "/api/profile") {
        const b = await readBody(req);
        await saveProfile({
          nome: String(b.nome ?? "").trim(),
          matricula: String(b.matricula ?? "").trim(),
        });
        return json(res, 200, { ok: true });
      }
      if (url === "/api/refresh") {
        if (!refresh.start()) return json(res, 200, { running: true });
        return json(res, 200, { started: true });
      }
      if (url === "/api/ai-config") {
        const b = await readBody(req);
        const cfg = await getAiConfig();
        const next = { ...cfg, models: { ...cfg.models } };
        if (b.model != null) {
          next.model = String(b.model).trim() || cfg.model;
          next.models.generation = next.model;
        }
        if (b.models && typeof b.models === "object" && !Array.isArray(b.models)) {
          const patch = b.models as Record<string, unknown>;
          for (const key of Object.keys(next.models) as (keyof AiModels)[]) {
            const v = patch[key];
            if (typeof v === "string" && v.trim()) next.models[key] = v.trim();
          }
          next.model = next.models.generation;
        }
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
        if (typeof b.projectAutoDetect === "boolean") {
          next.projectAutoDetect = b.projectAutoDetect;
        }
        if (b.abilities && typeof b.abilities === "object" && !Array.isArray(b.abilities)) {
          next.abilities = mergeAbilities({ ...next.abilities, ...(b.abilities as Record<string, unknown>) });
        }
        await saveAiConfig(next);
        return json(res, 200, {
          ok: true,
          model: next.model,
          models: next.models,
          temperature: next.temperature,
          max_output_tokens: next.max_output_tokens,
          abilities: next.abilities,
          style: next.style,
          activitySections: next.activitySections,
          projectAutoDetect: next.projectAutoDetect ?? true,
        });
      }
      if (url === "/api/gate") {
        // Quality gate: cheap-model analysis of the draft against the question.
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const view = await findView(id);
        if (!isAnswerable(view)) return json(res, 400, { error: "Esta atividade não aceita resposta por aqui." });
        const draft = String(b.draft ?? view.answer ?? "").trim();
        if (!draft) return json(res, 200, { ok: true, result: null });
        try {
          const cfg = await getAiConfig();
          const result = await analyzeDraftQuality(cfg, view, draft);
          // Persist so a manual "Analyze" survives a page refresh. No-op when the
          // item has no saved attempt yet (unsaved manual draft).
          if (result) await saveAnswerGate(id, result).catch(() => undefined);
          return json(res, 200, { ok: true, result });
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (url === "/api/diagram") {
        // UML diagram tool: build a spec + SVG from the draft (PNG on request).
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id required" });
        const view = await findView(id);
        const draft = String(b.draft ?? view.answer ?? "").trim();
        if (!draft) return json(res, 200, { ok: true, diagram: null });
        try {
          const cfg = await getAiConfig();
          const systemName = await resolveSystemName(view);
          const artifact = await buildDiagram(cfg, view, draft, {
            systemName,
            png: b.png === true,
          });
          return json(res, 200, {
            ok: true,
            diagram: artifact
              ? {
                  spec: artifact.spec,
                  svg: artifact.svg,
                  pngDataUrl: artifact.png
                    ? `data:image/png;base64,${artifact.png.toString("base64")}`
                    : null,
                }
              : null,
          });
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (url === "/api/answer/manual") {
        const b = await readBody(req);
        const id = Number(b.id);
        const answer = String(b.answer ?? "").trim();
        if (!id || !answer) return json(res, 400, { error: "answer required" });
        const view = await findView(id);
        if (!isAnswerable(view)) return json(res, 400, { error: "Esta atividade não aceita resposta por aqui." });
        const selections = view.kind === "quiz" ? parseQuizSelections(answer, view.questions) : [];
        const shown = view.kind === "quiz" ? humanizeQuizAnswer(answer, view.questions) : answer;
        const rec = await saveAnswerVersion(id, shown, "manual", undefined, selections);
        return json(res, 200, { ok: true, current: rec, history: rec.history, updatedAt: rec.updatedAt });
      }
      if (url === "/api/answer") {
        const b = await readBody(req);
        const id = Number(b.id);
        const view = await findView(id);
        if (!isAnswerable(view)) return json(res, 400, { error: "Esta atividade não aceita resposta por aqui." });
        const { shown, rec, gate } = await generateAndSave(id, view, {
          model: b.model ? String(b.model) : undefined,
        });
        const gateResult = await gate;
        if (gateResult) rec.gate = gateResult;
        return json(res, 200, { answer: shown, current: rec, history: rec.history, updatedAt: rec.updatedAt });
      }
      if (url === "/api/answer/stream") {
        // SSE: delta events while generating, then a final done event
        const b = await readBody(req);
        const id = Number(b.id);
        const view = await findView(id);
        if (!isAnswerable(view)) return json(res, 400, { error: "Esta atividade não aceita resposta por aqui." });

        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        const sendEvent = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
        sendEvent({ type: "start" });
        try {
          const { shown, rec, gate } = await generateAndSave(id, view, {
            model: b.model ? String(b.model) : undefined,
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
          });
          // Deliver the draft first, then the persisted confidence result.
          sendEvent({ type: "done", answer: shown, current: rec, history: rec.history });
          const gateResult = await gate;
          if (gateResult) sendEvent({ type: "gate", result: gateResult });
          res.end();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendEvent({ type: "error", error: message });
          res.end();
        }
        return;
      }
      if (url === "/api/send/upload") {
        // Receive a manual screenshot (print task) as base64 and persist it.
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id obrigatório" });
        const mime = String(b.mime ?? "");
        const ext = IMAGE_MIME_TO_EXT[mime];
        if (!ext) return json(res, 400, { error: "Tipo de imagem não suportado (use PNG, JPG ou WebP)." });
        const raw = String(b.data ?? "");
        const comma = raw.indexOf(",");
        const buf = Buffer.from(comma >= 0 ? raw.slice(comma + 1) : raw, "base64");
        if (buf.length === 0) return json(res, 400, { error: "Arquivo vazio." });
        if (buf.length > 10 * 1024 * 1024) return json(res, 413, { error: "Imagem grande demais (máx. 10 MB)." });
        const filePath = saveUploadedImage(id, ext, buf);
        return json(res, 200, { ok: true, name: path.basename(filePath) });
      }
      if (url === "/api/send") {
        const b = await readBody(req);
        const id = Number(b.id);
        let answer = String(b.answer ?? "");
        const rawMode = String(b.mode ?? "");
        const mode: SendMode =
          rawMode === "text" ||
          rawMode === "pdf" ||
          rawMode === "txt" ||
          rawMode === "docx" ||
          rawMode === "image" ||
          rawMode === "fill"
            ? rawMode
            : "txt";
        const view = await findView(id);
        if (view.status === "done") return json(res, 400, { error: "Esta atividade já está concluída." });
        const env = sendEnv();
        if (!env.enabled) return json(res, 503, { error: env.reason });

        let selections: QuizSelection[] = [];
        if (view.kind === "quiz") {
          selections = coerceSelections(b.selections, view.questions);
          if (selections.length === 0) selections = parseQuizSelections(answer, view.questions);
          if (selections.length === 0)
            return json(res, 400, { error: "Não foi possível identificar as alternativas escolhidas na resposta." });
          const shown =
            answer.trim() || selections.map((s) => `Q${s.questionId}: ${s.letter}`).join(", ");
          await saveAnswerVersion(id, shown, "manual", undefined, selections);
        } else {
          // Ghost tasks submit the student's name/matrícula when nothing typed.
          if (view.flavor === "ghost" && !answer.trim()) {
            answer = composeGhostAnswer(await getProfile());
          }
          if (mode !== "image" && !answer.trim()) {
            return json(res, 400, { error: "Escreva a resposta antes de enviar." });
          }
          await saveAnswerVersion(id, answer, "manual", undefined, []);
        }
        try {
          let submission;
          if (view.kind === "quiz") {
            submission = await launchQuizSubmit(view, selections);
          } else if (view.kind === "forum") {
            submission = await launchForumSubmit(view, answer);
          } else {
            let filePath: string | undefined;
            if (mode === "docx") {
              const built = await buildFilledDocx(view, answer);
              if ("error" in built) return json(res, 400, { error: built.error });
              const dir = assist("data", "send");
              mkdirSync(dir, { recursive: true });
              filePath = path.join(dir, built.filename);
              writeFileSync(filePath, built.buffer);
            } else if (mode === "pdf" || mode === "fill") {
              const pdf = await answerToPdf(answer, await uploadBaseName(view), { rich: mode === "fill" });
              if (!pdf)
                return json(res, 500, {
                  error: "Não foi possível gerar o PDF da resposta (LibreOffice indisponível?).",
                });
              filePath = pdf;
            } else if (mode === "image") {
              const found = findUploadedImage(id);
              if (!found) return json(res, 400, { error: "Anexe a imagem antes de enviar." });
              filePath = found;
            }
            submission = await launchUploadSubmit(view, answer, mode, filePath);
          }
          return json(res, 200, {
            ok: true,
            submission: { status: submission.status, detail: submission.detail, at: submission.at, mode: submission.mode },
          });
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (url === "/api/mark") {
        const b = await readBody(req);
        const id = Number(b.id);
        if (!id) return json(res, 400, { error: "id obrigatório" });
        const view = await findView(id);
        if (view.kind !== "mark") return json(res, 400, { error: "Esta atividade não pode ser marcada por aqui." });
        if (view.status === "done") return json(res, 400, { error: "Esta atividade já está concluída." });
        const env = sendEnv();
        if (!env.enabled) return json(res, 503, { error: env.reason });
        try {
          const submission = await launchMarkComplete(view);
          return json(res, 200, { ok: true, submission });
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    if (url.startsWith("/api/export/")) {
      const id = Number(url.split("/")[3]);
      const view = (await allViews()).find((x) => x.id === id);
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

/** Import the scraped catalog once, when the database has no content yet. */
async function ensureImported(): Promise<void> {
  const rows = await query<{ n: string }>("SELECT count(*)::text AS n FROM content_item");
  if (Number(rows[0]?.n ?? "0") > 0) return;
  if (!existsSync(raw("content-tree.json"))) return;
  console.log("   db: no content imported yet — importing scraped data…");
  const summary = await importAll();
  console.log(`   db: imported ${summary.items} item(s), ${summary.professors} professor(s).`);
}

/** Rebuild `exercises.json` whenever the DB catalog version no longer matches. */
async function ensureProjection(): Promise<void> {
  const desired = await getCatalogVersion();
  const meta = readProjectionMeta();
  if (existsSync(ASSISTANT_EXERCISES_FILE) && meta?.catalogVersion === desired) return;
  try {
    const { count } = await writeProjection();
    console.log(`   index: projected ${count} exercise(s) (cache ${meta ? "stale" : "missing"}).`);
  } catch (err) {
    console.warn(`   index: could not build (${err instanceof Error ? err.message : String(err)})`);
  }
}

/**
 * Postgres is required: verify the connection, apply migrations, import the
 * scraped catalog when empty, then (re)build the UI cache when stale. Start.
 */
async function bootstrap(): Promise<void> {
  await healthCheck();
  await runMigrations();
  await ensureImported();
  await ensureProjection();
  try {
    const extracted = await ensureContentText();
    if (extracted) {
      console.log(
        `   text: extracted ${extracted.withText}/${extracted.items} item(s) (${extracted.totalChars} chars).`,
      );
    }
  } catch (err) {
    console.warn(`   text: could not extract material (${err instanceof Error ? err.message : String(err)})`);
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n📝 LXP Toolkit → http://localhost:${PORT}`);
    console.log(`   data: ${dataDir()}`);
    console.log(`   ai config: Postgres · ai_config`);
    console.log(`   openai key: …${openaiKeyLast4()} (fonte: ${openaiKeySource()})`);
    console.log(
      `   auth: ${toolkitToken() ? "TOOLKIT_TOKEN ativo (API privada)" : "sem TOOLKIT_TOKEN (modo local)"}\n`,
    );
  });
}

bootstrap().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

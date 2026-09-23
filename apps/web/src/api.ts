import type {
  AbilityId,
  AbilitySettings,
  ActivityProjectDto,
  AiActivitySections,
  AiConfigDto,
  AiModels,
  AiProfile,
  AiStyle,
  AnalyzeResultDto,
  Anomaly,
  AnswerEntry,
  AnswerState,
  DebugLogDto,
  DebugLogFullDto,
  DiagramArtifactDto,
  ExercisesPayload,
  FlavorSource,
  GateResultDto,
  OrganizationDto,
  ProfessorLink,
  ProjectProfileDto,
  ProjectProfileMode,
  ProjectReadmeStatus,
  ProjectSourceFile,
  ProjectSourceState,
  QuizSelection,
  StudySummary,
  TrainingQuiz,
  TrainingQuizMode,
  TrainingStats,
  TrainingSubject,
  UploadFlavor,
} from "./types";
import { getLang, localeFor, translate } from "./lib/i18n";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    let detail = "";
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body?.error) detail = ` · ${body.error}`;
    } catch {
      // non-JSON error body (e.g. dev-server proxy page)
    }
    throw new Error(`${init?.method ?? "GET"} ${path} → HTTP ${res.status}${detail}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (text && !contentType.includes("application/json")) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} → ${translate(getLang(), "api.nonJson")}`,
    );
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function post(path: string, body: unknown): Promise<unknown> {
  return req<unknown>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchExercises(): Promise<ExercisesPayload> {
  return req<ExercisesPayload>("/api/exercises");
}

export async function fetchConfig(): Promise<AiConfigDto> {
  return req<AiConfigDto>("/api/config");
}

export async function saveProfile(profile: AiProfile): Promise<void> {
  await post("/api/profile", profile);
}

// ── Professor photos ────────────────────────────────────────────────────────

export async function fetchProfessorLinks(): Promise<ProfessorLink[]> {
  const body = await req<{ links: ProfessorLink[] }>("/api/professor-links");
  return body.links ?? [];
}

export interface SaveProfessorPhotoInput {
  professorId: number;
  linkedinUrl?: string | null;
  imageUrl?: string | null;
}

export interface SaveProfessorPhotoResult {
  ok: boolean;
  removed?: boolean;
  link: ProfessorLink | null;
}

export async function saveProfessorPhoto(input: SaveProfessorPhotoInput): Promise<SaveProfessorPhotoResult> {
  return (await post("/api/professor-link", input)) as SaveProfessorPhotoResult;
}

export async function deleteProfessorPhoto(professorId: number): Promise<void> {
  await req(`/api/professor-link/${professorId}`, { method: "DELETE" });
}

// ── Organizations (hardcoded directory) ─────────────────────────────────────

export async function fetchOrganizations(): Promise<OrganizationDto[]> {
  const body = await req<{ organizations: OrganizationDto[] }>("/api/organizations");
  return body.organizations ?? [];
}

// ── External project source (Ajustes → Organização) ─────────────────────────

export interface ProjectSourceStateDto {
  source: ProjectSourceState;
  files: ProjectSourceFile[];
}

export async function fetchProjectSource(): Promise<ProjectSourceStateDto> {
  const body = await req<{ source: ProjectSourceState; files: ProjectSourceFile[] }>("/api/project-source");
  return { source: body.source, files: body.files ?? [] };
}

export interface SaveProjectSourceInput {
  title?: string;
  githubUrl?: string;
  notes?: string;
}

export async function saveProjectSource(input: SaveProjectSourceInput): Promise<ProjectSourceState> {
  const res = (await post("/api/project-source", input)) as { source: ProjectSourceState };
  return res.source;
}

export interface ProjectReadmeResult {
  ok: boolean;
  status: ProjectReadmeStatus;
  detail: string;
  source: ProjectSourceState;
}

/** Fetch the repo README server-side and cache it as project context. */
export async function fetchProjectReadme(githubUrl?: string): Promise<ProjectReadmeResult> {
  return (await post("/api/project-source/fetch", { githubUrl })) as ProjectReadmeResult;
}

/** Upload a project file (base64) and get its extracted-text status. */
export async function uploadProjectFile(file: File): Promise<ProjectSourceFile> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const res = (await post("/api/project-source/file", {
    filename: file.name,
    mime: file.type || null,
    data: dataUrl,
  })) as { ok?: boolean; file?: ProjectSourceFile; error?: string };
  if (!res.ok || !res.file) throw new Error(res.error ?? "upload failed");
  return res.file;
}

export async function deleteProjectFile(id: number): Promise<void> {
  await req(`/api/project-source/file/${id}`, { method: "DELETE" });
}

export interface AiRequestSaveResult {
  ok: boolean;
  aiRequestJson: string;
  hasAiOverride: boolean;
}

export async function saveAiRequest(id: number, raw: string | null): Promise<AiRequestSaveResult> {
  return (await post("/api/ai-request", { id, raw })) as AiRequestSaveResult;
}

/**
 * Lazily resolve the project context for an activity: whether it needs a
 * project, the course main project, and any quick project proposed by the
 * activity. Cached server-side.
 */
export async function analyzeActivityContext(id: number, forceProfile = false): Promise<AnalyzeResultDto> {
  return (await post("/api/context/analyze", { id, forceProfile })) as AnalyzeResultDto;
}

export interface SaveProjectProfileInput {
  courseId: number;
  theme?: string;
  atores?: string[];
  requisitos?: string[];
  suggestedThemes?: string[];
}

/** Manually edit the course MAIN project. */
export async function saveProjectProfile(input: SaveProjectProfileInput): Promise<ProjectProfileDto> {
  const res = (await post("/api/project-profile", input)) as { profile: ProjectProfileDto };
  return res.profile;
}

export interface SaveActivityProjectInput {
  id: number;
  needsProject?: boolean;
  profileMode?: ProjectProfileMode;
  theme?: string | null;
  atores?: string[];
  requisitos?: string[];
}

/** Choose the main project, a quick project, or none for one activity. */
export async function saveActivityProject(input: SaveActivityProjectInput): Promise<ActivityProjectDto> {
  const res = (await post("/api/activity-project", input)) as { activity: ActivityProjectDto };
  return res.activity;
}

export interface TagSaveResult {
  ok: boolean;
  tag: string | null;
  flavor: string;
  flavorSource: string;
  anomalies: Anomaly[];
}

/** Set/clear a manual anomaly tag (ghost | print | anomalia). */
export async function saveTag(id: number, tag: string | null): Promise<TagSaveResult> {
  return (await post("/api/tag", { id, tag })) as TagSaveResult;
}

export interface FlavorClassifyResult {
  ok: boolean;
  /** False when the call was skipped (manual tag / already cached / no verdict). */
  classified: boolean;
  flavor: UploadFlavor;
  flavorSource: FlavorSource;
  anomalies: Anomaly[];
  reason?: string;
}

/** Lazy AI review of an ambiguous upload task (called when the task opens). */
export async function classifyFlavor(id: number): Promise<FlavorClassifyResult> {
  return (await post("/api/flavor/classify", { id })) as FlavorClassifyResult;
}

/** Upload a manual screenshot for a print task. Returns the stored file name. */
export async function uploadSendFile(id: number, file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const res = (await post("/api/send/upload", { id, mime: file.type, data: dataUrl })) as {
    ok?: boolean;
    name?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(res.error ?? "upload failed");
  return res.name ?? "";
}

export interface AiConfigSavePatch {
  model?: string;
  models?: Partial<AiModels>;
  temperature?: number;
  max_output_tokens?: number;
  style?: Partial<AiStyle>;
  activitySections?: Partial<AiActivitySections>;
  projectAutoDetect?: boolean;
  abilities?: AbilitySettings;
}

export async function saveAiConfig(patch: AiConfigSavePatch): Promise<void> {
  await post("/api/ai-config", patch);
}

/** Per-activity ability overrides (ability id -> enabled). */
export async function fetchActivityAbilities(id: number): Promise<Partial<Record<AbilityId, boolean>>> {
  const body = await req<{ abilities: Partial<Record<AbilityId, boolean>> }>(`/api/activity-abilities/${id}`);
  return body.abilities ?? {};
}

/**
 * Set (or clear, with `null`) a per-activity ability override. The override wins
 * over the global config switch for that activity.
 */
export async function setActivityAbility(
  id: number,
  ability: AbilityId,
  enabled: boolean | null,
): Promise<Partial<Record<AbilityId, boolean>>> {
  const body = (await post("/api/activity-ability", { id, ability, enabled })) as {
    abilities: Partial<Record<AbilityId, boolean>>;
  };
  return body.abilities ?? {};
}

export interface RefreshStatus {
  running: boolean;
  step: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  log?: string;
}

/** Ask the server to scrape fresh portal content and rebuild the list. */
export async function startContentRefresh(): Promise<void> {
  await post("/api/refresh", {});
}

export async function fetchRefreshStatus(): Promise<RefreshStatus> {
  return req<RefreshStatus>("/api/refresh/status");
}

export async function fetchAnswerState(id: number): Promise<AnswerState> {
  return req<AnswerState>(`/api/answer/${id}`);
}

export async function saveManualAnswer(id: number, answer: string): Promise<AnswerState> {
  const res = (await post("/api/answer/manual", { id, answer })) as { current: AnswerEntry; history: AnswerEntry[] };
  return { current: res.current, history: res.history };
}

export async function restoreAnswerVersion(id: number, index: number): Promise<AnswerState> {
  const res = (await post(`/api/answer/${id}/restore`, { index })) as { current: AnswerEntry; history: AnswerEntry[] };
  return { current: res.current, history: res.history };
}

export async function clearAnswerHistory(id: number): Promise<AnswerState> {
  const res = await req<{ current: AnswerEntry; history: AnswerEntry[] }>(`/api/answer/${id}/history`, { method: "DELETE" });
  return { current: res.current, history: res.history };
}

export interface GenerateEvent {
  type: "start" | "delta" | "done" | "gate" | "error";
  delta?: string;
  answer?: string;
  current?: AnswerEntry;
  history?: AnswerEntry[];
  /** Quality-gate result, delivered after `done` (server-side analysis). */
  result?: GateResultDto;
  error?: string;
}

/**
 * Stream an AI generation via SSE. Resolves once the stream closes; rejects on
 * error. Keeps reading past `done` so a trailing `gate` event (the server-side
 * confidence result) is still delivered to `onEvent`.
 */
export async function streamGenerate(id: number, onEvent: (e: GenerateEvent) => void): Promise<AnswerState> {
  const res = await fetch("/api/answer/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body?.error) detail = ` · ${body.error}`;
    } catch {
      // ignore
    }
    throw new Error(`POST /api/answer/stream → HTTP ${res.status}${detail}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalState: AnswerState | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const chunk of lines) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.slice(5).trim()) as GenerateEvent;
      onEvent(payload);
      if (payload.type === "done") {
        finalState = { current: payload.current ?? null, history: payload.history ?? [] };
      }
      if (payload.type === "error") {
        throw new Error(payload.error ?? translate(getLang(), "api.genFail"));
      }
    }
  }
  if (!finalState) throw new Error(translate(getLang(), "api.streamEnded"));
  return finalState;
}

export async function generateAnswerPlain(id: number): Promise<AnswerState> {
  const res = (await post("/api/answer", { id })) as { answer: string; current: AnswerEntry; history: AnswerEntry[] };
  return { current: res.current ?? { answer: res.answer, updatedAt: "", source: "ai" }, history: res.history ?? [] };
}

/** Quality-gate analysis of a draft against the professor's question. */
export async function analyzeDraftGate(id: number, draft: string): Promise<GateResultDto | null> {
  const res = (await post("/api/gate", { id, draft })) as { result: GateResultDto | null };
  return res.result ?? null;
}

/** Build a UML use-case diagram from the draft (SVG; PNG when requested). */
export async function generateDiagram(
  id: number,
  draft: string,
  png = false,
): Promise<DiagramArtifactDto | null> {
  const res = (await post("/api/diagram", { id, draft, png })) as {
    diagram: DiagramArtifactDto | null;
  };
  return res.diagram ?? null;
}

/** Recent weak-draft diagnostics (newest first). */
export async function fetchDebugLogs(): Promise<DebugLogDto[]> {
  const body = await req<{ logs: DebugLogDto[] }>("/api/debug-logs");
  return body.logs ?? [];
}

export async function fetchDebugLog(id: number): Promise<DebugLogFullDto | null> {
  const body = await req<{ log: DebugLogFullDto }>(`/api/debug-log/${id}`);
  return body.log ?? null;
}

export interface SendConfigDto {
  enabled: boolean;
  reason: string;
}

export async function fetchSendConfig(): Promise<SendConfigDto> {
  try {
    return await req<SendConfigDto>("/api/send/config");
  } catch {
    return { enabled: false, reason: translate(getLang(), "api.unavailable") };
  }
}

export interface SendPreviewDto {
  ok: boolean;
  reason: string;
  kind: string;
  title: string;
  courseName: string;
  status: string;
  hasAnswer: boolean;
}

export async function fetchSendPreview(id: number): Promise<SendPreviewDto> {
  return req<SendPreviewDto>(`/api/send/preview?id=${id}`);
}

export type SubmissionStatus = "running" | "ok" | "already" | "unknown" | "failed";

/** How an upload answer reaches the portal. */
export type SendMode = "text" | "txt" | "pdf" | "docx" | "image" | "fill";

export interface SubmissionDto {
  status: SubmissionStatus;
  detail: string;
  at: string;
  answer?: string;
  mode?: SendMode;
  attachmentName?: string;
  attemptNumber?: number | null;
  portalDetail?: string;
  confirmationAt?: string;
}

export async function sendAnswerToPortal(
  id: number,
  answer: string,
  mode: SendMode = "txt",
  selections?: QuizSelection[],
): Promise<SubmissionDto> {
  const body = (await post("/api/send", { id, answer, mode, selections })) as {
    error?: string;
    submission?: SubmissionDto;
  };
  if (!body.submission) throw new Error(body.error ?? "HTTP");
  return body.submission;
}

/** Mark a recordable content item as completed on the portal. */
export async function markComplete(id: number): Promise<SubmissionDto> {
  const body = (await post("/api/mark", { id })) as { error?: string; submission?: SubmissionDto };
  if (!body.submission) throw new Error(body.error ?? "HTTP");
  return body.submission;
}

export interface SendArtifactDto {
  blob: Blob;
  filename: string;
}

/**
 * Build the exact file that would be sent (`txt`/`pdf`) from the current draft,
 * without submitting. Returns the blob + suggested filename for preview/download.
 */
export async function fetchSendArtifact(
  id: number,
  answer: string,
  mode: SendMode,
  download = false,
): Promise<SendArtifactDto> {
  const res = await fetch("/api/send/artifact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, answer, mode, download }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body?.error) detail = ` · ${body.error}`;
    } catch {
      // non-JSON error body
    }
    throw new Error(`POST /api/send/artifact → HTTP ${res.status}${detail}`);
  }
  const blob = await res.blob();
  const fallbackExt = mode === "pdf" || mode === "fill" ? "pdf" : mode === "docx" ? "docx" : "txt";
  const filename = res.headers.get("x-filename") ?? `resposta.${fallbackExt}`;
  return { blob, filename };
}

export async function fetchSubmission(id: number): Promise<SubmissionDto | null> {
  try {
    const body = await req<{ submission?: SubmissionDto | null }>(`/api/send/${id}`);
    return body.submission ?? null;
  } catch {
    return null;
  }
}

export async function fetchSubmissions(id: number): Promise<SubmissionDto[]> {
  try {
    const body = await req<{ submissions?: SubmissionDto[] }>(`/api/send/${id}`);
    return body.submissions ?? [];
  } catch {
    return [];
  }
}

// ── Training ("Treino") ─────────────────────────────────────────────────────

export async function fetchTrainingSubjects(): Promise<TrainingSubject[]> {
  const body = await req<{ subjects: TrainingSubject[] }>("/api/training/subjects");
  return body.subjects ?? [];
}

export interface TrainingQuizRequest {
  courseId: number;
  moduleId?: number | null;
  mode: TrainingQuizMode;
  count: number;
}

export async function generateTrainingQuiz(body: TrainingQuizRequest): Promise<TrainingQuiz> {
  return (await post("/api/training/quiz", body)) as TrainingQuiz;
}

export interface TrainingAnswerDto {
  questionId: number;
  chosenIndex: number | null;
  isCorrect: boolean;
}

export async function completeTrainingQuiz(
  id: number,
  answers: TrainingAnswerDto[],
  score: number,
): Promise<void> {
  await post(`/api/training/quiz/${id}/complete`, { answers, score });
}

export async function fetchTrainingStats(): Promise<TrainingStats> {
  return req<TrainingStats>("/api/training/stats");
}

export interface StudyEvent {
  type: "start" | "delta" | "done" | "error";
  delta?: string;
  answer?: string;
  error?: string;
}

export interface StudyRequest {
  courseId: number;
  moduleId?: number | null;
  query: string;
}

/** Stream a study-guide answer via SSE. Resolves with the full text. */
export async function streamStudyGuide(
  body: StudyRequest,
  onEvent: (e: StudyEvent) => void,
): Promise<string> {
  const res = await fetch("/api/training/study", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) detail = ` · ${parsed.error}`;
    } catch {
      // ignore
    }
    throw new Error(`POST /api/training/study → HTTP ${res.status}${detail}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.slice(5).trim()) as StudyEvent;
      onEvent(payload);
      if (payload.type === "delta" && payload.delta) full += payload.delta;
      if (payload.type === "done") return payload.answer ?? full;
      if (payload.type === "error") {
        throw new Error(payload.error ?? translate(getLang(), "api.genFail"));
      }
    }
  }
  return full;
}

// ── Resumo ("study summary") ────────────────────────────────────────────────

export interface SummaryScope {
  courseId: number;
  moduleId?: number | null;
}

/** The saved Resumo for a subject scope, or null when none exists yet. */
export async function fetchStudySummary(scope: SummaryScope): Promise<StudySummary | null> {
  const params = new URLSearchParams({ courseId: String(scope.courseId) });
  if (scope.moduleId != null) params.set("moduleId", String(scope.moduleId));
  const body = await req<{ summary: StudySummary | null }>(`/api/summary?${params.toString()}`);
  return body.summary ?? null;
}

export interface SummaryEvent {
  type: "start" | "step" | "delta" | "done" | "error";
  /** Progress within the map/reduce pipeline. */
  phase?: "map" | "combine";
  index?: number;
  total?: number;
  label?: string;
  delta?: string;
  summary?: StudySummary;
  error?: string;
}

/**
 * Generate (or regenerate) the Resumo via SSE. Resolves with the saved summary
 * once the stream closes; rejects on error.
 */
export async function streamStudySummary(
  scope: SummaryScope,
  onEvent: (e: SummaryEvent) => void,
): Promise<StudySummary> {
  const res = await fetch("/api/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(scope),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) detail = ` · ${parsed.error}`;
    } catch {
      // ignore
    }
    throw new Error(`POST /api/summary → HTTP ${res.status}${detail}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let saved: StudySummary | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.slice(5).trim()) as SummaryEvent;
      onEvent(payload);
      if (payload.type === "done" && payload.summary) saved = payload.summary;
      if (payload.type === "error") {
        throw new Error(payload.error ?? translate(getLang(), "api.genFail"));
      }
    }
  }
  if (!saved) throw new Error(translate(getLang(), "api.streamEnded"));
  return saved;
}

export function fmtVersionDate(iso: string, locale = localeFor(getLang())): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function snippet(text: string, max = 80): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

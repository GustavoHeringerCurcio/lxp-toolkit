import type {
  AiActivitySections,
  AiConfigDto,
  AiProfile,
  AiStyle,
  AnswerEntry,
  AnswerState,
  ExercisesPayload,
  OrganizationDto,
  ProfessorLink,
  QuizSelection,
  TrainingQuiz,
  TrainingQuizMode,
  TrainingStats,
  TrainingSubject,
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

export interface AiRequestSaveResult {
  ok: boolean;
  aiRequestJson: string;
  hasAiOverride: boolean;
}

export async function saveAiRequest(id: number, raw: string | null): Promise<AiRequestSaveResult> {
  return (await post("/api/ai-request", { id, raw })) as AiRequestSaveResult;
}

export interface AiConfigSavePatch {
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
  style?: Partial<AiStyle>;
  activitySections?: Partial<AiActivitySections>;
}

export async function saveAiConfig(patch: AiConfigSavePatch): Promise<void> {
  await post("/api/ai-config", patch);
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
  type: "start" | "delta" | "done" | "error";
  delta?: string;
  answer?: string;
  current?: AnswerEntry;
  history?: AnswerEntry[];
  error?: string;
}

/** Stream an AI generation via SSE. Resolves on done; rejects on error. */
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
        return { current: payload.current ?? null, history: payload.history ?? [] };
      }
      if (payload.type === "error") {
        throw new Error(payload.error ?? translate(getLang(), "api.genFail"));
      }
    }
  }
  throw new Error(translate(getLang(), "api.streamEnded"));
}

export async function generateAnswerPlain(id: number): Promise<AnswerState> {
  const res = (await post("/api/answer", { id })) as { answer: string; current: AnswerEntry; history: AnswerEntry[] };
  return { current: res.current ?? { answer: res.answer, updatedAt: "", source: "ai" }, history: res.history ?? [] };
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
export type SendMode = "text" | "txt" | "pdf";

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
  const filename = res.headers.get("x-filename") ?? `resposta.${mode === "pdf" ? "pdf" : "txt"}`;
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

export function fmtVersionDate(iso: string, locale = localeFor(getLang())): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function snippet(text: string, max = 80): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

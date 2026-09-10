import type { AiConfigDto, AiProfile, AnswerEntry, AnswerState, ExercisesPayload } from "./types";

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
      `${init?.method ?? "GET"} ${path} → resposta não-JSON. O servidor parece desatualizado: reinicie-o e tente de novo.`,
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

export interface AiRequestSaveResult {
  ok: boolean;
  aiRequestJson: string;
  hasAiOverride: boolean;
}

export async function saveAiRequest(id: number, raw: string | null): Promise<AiRequestSaveResult> {
  return (await post("/api/ai-request", { id, raw })) as AiRequestSaveResult;
}

export async function saveMessageTemplate(raw: string): Promise<void> {
  await post("/api/message-template", { raw });
}

export async function saveActivityTemplate(raw: string): Promise<void> {
  await post("/api/activity-template", { raw });
}

export interface AiConfigSavePatch {
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
}

export async function saveAiConfig(patch: AiConfigSavePatch): Promise<void> {
  await post("/api/ai-config", patch);
}

export async function fetchAiTemplates(): Promise<Record<string, string>> {
  const res = await req<{ templates?: Record<string, string> }>("/api/ai-templates");
  return res.templates ?? {};
}

export async function saveAiTemplate(name: string, text: string): Promise<Record<string, string>> {
  const res = (await post("/api/ai-templates", { name, text })) as { templates?: Record<string, string> };
  return res.templates ?? {};
}

export async function deleteAiTemplate(name: string): Promise<Record<string, string>> {
  const res = await req<{ templates?: Record<string, string> }>(
    `/api/ai-templates?name=${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  return res.templates ?? {};
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
        throw new Error(payload.error ?? "falha na geração");
      }
    }
  }
  throw new Error("stream encerrou sem resposta");
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
    return { enabled: false, reason: "serviço indisponível" };
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

export type SubmissionStatus = "running" | "ok" | "unknown" | "failed";

export interface SubmissionDto {
  status: SubmissionStatus;
  detail: string;
  at: string;
}

export async function sendAnswerToPortal(id: number, answer: string): Promise<SubmissionDto> {
  const body = (await post("/api/send", { id, answer })) as { error?: string; submission?: SubmissionDto };
  if (!body.submission) throw new Error(body.error ?? "HTTP");
  return body.submission;
}

export async function fetchSubmission(id: number): Promise<SubmissionDto | null> {
  try {
    const body = await req<{ submission?: SubmissionDto | null }>(`/api/send/${id}`);
    return body.submission ?? null;
  } catch {
    return null;
  }
}

export function daysLabel(daysLeft: number | null): string {
  if (daysLeft == null) return "sem prazo";
  if (daysLeft < 0) return "atrasado";
  if (daysLeft === 0) return "vence hoje";
  if (daysLeft === 1) return "vence amanhã";
  return `faltam ${daysLeft}d`;
}

export function fmtVersionDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function snippet(text: string, max = 80): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

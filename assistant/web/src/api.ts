import type { ExercisesPayload } from "./types";

export async function fetchExercises(): Promise<ExercisesPayload> {
  const res = await fetch("/api/exercises");
  const text = await res.text();
  if (!res.ok) {
    let detail = "";
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body?.error) detail = ` · ${body.error}`;
    } catch {
      // non-JSON error body (e.g. dev-server proxy page)
    }
    throw new Error(`GET /api/exercises → HTTP ${res.status}${detail}`);
  }
  return JSON.parse(text) as ExercisesPayload;
}

export interface AiConfigDto {
  model: string;
  language: string;
  configPath: string;
}

export async function fetchConfig(): Promise<AiConfigDto> {
  const res = await fetch("/api/config");
  if (!res.ok) return { model: "gpt-4o-mini", language: "pt-BR", configPath: "" };
  return (await res.json()) as AiConfigDto;
}

export async function saveNote(id: number, notes: string): Promise<void> {
  await fetch("/api/note", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, notes }),
  });
}

export async function generateAnswer(id: number): Promise<{ answer: string }> {
  const res = await fetch("/api/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const body = (await res.json()) as { answer?: string; error?: string };
  if (!res.ok || body.answer == null) throw new Error(body.error ?? `HTTP ${res.status}`);
  return { answer: body.answer };
}

export async function saveManualAnswer(id: number, answer: string): Promise<void> {
  const res = await fetch("/api/answer/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, answer }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
}

export interface SendConfigDto {
  enabled: boolean;
  reason: string;
}

export async function fetchSendConfig(): Promise<SendConfigDto> {
  try {
    const res = await fetch("/api/send/config");
    return (await res.json()) as SendConfigDto;
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
  const res = await fetch(`/api/send/preview?id=${id}`);
  return (await res.json()) as SendPreviewDto;
}

export type SubmissionStatus = "running" | "ok" | "unknown" | "failed";

export interface SubmissionDto {
  status: SubmissionStatus;
  detail: string;
  at: string;
}

export async function sendAnswerToPortal(id: number, answer: string): Promise<SubmissionDto> {
  const res = await fetch("/api/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, answer }),
  });
  const body = (await res.json()) as { error?: string; submission?: { status: SubmissionStatus; detail: string; at: string } };
  if (!res.ok || !body.submission) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.submission;
}

export async function fetchSubmission(id: number): Promise<SubmissionDto | null> {
  try {
    const res = await fetch(`/api/send/${id}`);
    const body = (await res.json()) as { submission?: SubmissionDto | null };
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

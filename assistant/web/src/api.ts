import type { ExercisesPayload } from "./types";

export async function fetchExercises(): Promise<ExercisesPayload> {
  const res = await fetch("/api/exercises");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ExercisesPayload;
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

export function daysLabel(daysLeft: number | null): string {
  if (daysLeft == null) return "sem prazo";
  if (daysLeft < 0) return "atrasado";
  if (daysLeft === 0) return "vence hoje";
  if (daysLeft === 1) return "vence amanhã";
  return `faltam ${daysLeft}d`;
}

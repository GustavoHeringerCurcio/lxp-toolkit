import type { GateResultDto } from "@/types";

/** Stable draft hash shared by the gate panel, send warning and server. */
export function hashDraft(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

/** The saved/delivered judgment only if it belongs to this exact draft. */
export function gateForDraft(
  gate: GateResultDto | null | undefined,
  draft: string,
): GateResultDto | null {
  if (!gate) return null;
  const text = draft.trim();
  if (!text || gate.draftHash !== hashDraft(text)) return null;
  return gate;
}

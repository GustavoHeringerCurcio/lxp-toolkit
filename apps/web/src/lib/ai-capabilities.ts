/**
 * User-facing contract of what the AI reads and does on an activity.
 *
 * ⚠️ KEEP THIS UPDATED. This registry drives the (i) modal in the Files card.
 * Whenever a new input source, attachment type or AI ability is added, add a
 * row here AND its `aiInfo.<id>.title` / `aiInfo.<id>.detail` strings in
 * `i18n/pt.ts` + `i18n/en.ts`. The capability list must never drift from the
 * server truth (`apps/server/src/prompt.ts`, `ai.ts`, `attachments.ts`,
 * `abilities.ts`).
 */
export type AiCapabilityKind = "reads" | "receives" | "does" | "doesNot" | "limits";

export interface AiCapability {
  /** i18n suffix: `aiInfo.<id>.title` / `aiInfo.<id>.detail`. */
  id: string;
  kind: AiCapabilityKind;
}

export const AI_CAPABILITY_GROUPS: { kind: AiCapabilityKind; headingKey: string }[] = [
  { kind: "reads", headingKey: "aiInfo.group.reads" },
  { kind: "receives", headingKey: "aiInfo.group.receives" },
  { kind: "does", headingKey: "aiInfo.group.does" },
  { kind: "doesNot", headingKey: "aiInfo.group.doesNot" },
  { kind: "limits", headingKey: "aiInfo.group.limits" },
];

export const AI_CAPABILITIES: readonly AiCapability[] = [
  // What it reads from the activity files.
  { id: "pdf", kind: "reads" },
  { id: "images", kind: "reads" },
  { id: "office", kind: "reads" },
  { id: "text", kind: "reads" },
  // What else it receives.
  { id: "instructions", kind: "receives" },
  { id: "questions", kind: "receives" },
  { id: "forum", kind: "receives" },
  { id: "notes", kind: "receives" },
  { id: "identity", kind: "receives" },
  { id: "project", kind: "receives" },
  // What it does.
  { id: "answer", kind: "does" },
  { id: "diagram", kind: "does" },
  { id: "gate", kind: "does" },
  // What it does not do.
  { id: "internet", kind: "doesNot" },
  { id: "links", kind: "doesNot" },
  { id: "audio", kind: "doesNot" },
  { id: "login", kind: "doesNot" },
  // Practical limits.
  { id: "chars", kind: "limits" },
  { id: "attachments", kind: "limits" },
  { id: "cost", kind: "limits" },
  { id: "model", kind: "limits" },
];

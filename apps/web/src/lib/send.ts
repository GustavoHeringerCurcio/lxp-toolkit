import type { SendMode } from "@/api";
import type { TranslateFn } from "@/lib/i18n";
import {
  DocxIcon,
  FillIcon,
  PdfIcon,
  TextIcon,
  TxtIcon,
  type SendGlyph,
} from "@/components/icons/send-icons";

/** Submission formats offered for `upload` activities. */
export const SEND_MODES: {
  value: SendMode;
  labelKey: string;
  icon: SendGlyph;
}[] = [
  { value: "text", labelKey: "send.mode.text.label", icon: TextIcon },
  { value: "txt", labelKey: "send.mode.txt.label", icon: TxtIcon },
  { value: "pdf", labelKey: "send.mode.pdf.label", icon: PdfIcon },
  { value: "docx", labelKey: "send.mode.docx.label", icon: DocxIcon },
  { value: "fill", labelKey: "send.mode.fill.label", icon: FillIcon },
];

export function sendModeLabel(mode: SendMode, t: TranslateFn): string {
  if (mode === "image") return t("send.mode.image.label");
  const match = SEND_MODES.find((m) => m.value === mode);
  return match ? t(match.labelKey) : mode;
}

/** True when the activity carries a professor-provided `.docx` model. */
export function hasDocxTemplate(files: { filename: string | null }[]): boolean {
  return files.some((f) => /\.docx$/i.test(f.filename ?? ""));
}

/**
 * Best default delivery format for an upload activity: `.docx` when the task
 * ships a model to fill, plain text otherwise.
 */
export function defaultSendMode(exercise: {
  kind: string;
  remoteFiles: { filename: string | null }[];
}): SendMode {
  if (exercise.kind !== "upload") return "text";
  return hasDocxTemplate(exercise.remoteFiles) ? "docx" : "text";
}

import type { SendMode } from "@/api";
import type { TranslateFn } from "@/lib/i18n";
import {
  PdfFormatIcon,
  TextFormatIcon,
  TxtFormatIcon,
  type FormatIcon,
} from "@/components/icons/format-icons";

/** Submission formats offered for `upload` activities. */
export const SEND_MODES: {
  value: SendMode;
  labelKey: string;
  hintKey: string;
  icon: FormatIcon;
}[] = [
  {
    value: "text",
    labelKey: "send.mode.text.label",
    hintKey: "send.mode.text.hint",
    icon: TextFormatIcon,
  },
  {
    value: "txt",
    labelKey: "send.mode.txt.label",
    hintKey: "send.mode.txt.hint",
    icon: TxtFormatIcon,
  },
  {
    value: "pdf",
    labelKey: "send.mode.pdf.label",
    hintKey: "send.mode.pdf.hint",
    icon: PdfFormatIcon,
  },
];

export function sendModeLabel(mode: SendMode, t: TranslateFn): string {
  const match = SEND_MODES.find((m) => m.value === mode);
  return match ? t(match.labelKey) : mode;
}

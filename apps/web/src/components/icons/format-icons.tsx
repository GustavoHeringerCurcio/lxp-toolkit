import type { ReactElement, ReactNode, SVGProps } from "react";
import { cn } from "cn";

/**
 * Custom submission-format icon family (direct text / .txt / .pdf).
 *
 * These deliberately do not use lucide so the three format types share one
 * hand-tuned visual language: 24px grid, 1.7 stroke, round caps/joins and
 * `currentColor` (the caller supplies the tint token). Keep every glyph inside
 * this file so the family stays consistent.
 */

type FormatIconProps = SVGProps<SVGSVGElement>;

function FormatIconBase({
  className,
  children,
  ...props
}: FormatIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Direct text — the portal's answer field with a text caret. */
export function TextFormatIcon(props: FormatIconProps) {
  return (
    <FormatIconBase {...props}>
      <rect x="3.25" y="4.75" width="17.5" height="14.5" rx="3" />
      <path d="M7 9.5h7" />
      <path d="M7 13.5h4.5" />
      <path d="M16 8.5v7" />
    </FormatIconBase>
  );
}

/** .txt — plain document with text lines. */
export function TxtFormatIcon(props: FormatIconProps) {
  return (
    <FormatIconBase {...props}>
      <path d="M14 3.25H7.75A2.25 2.25 0 0 0 5.5 5.5v13a2.25 2.25 0 0 0 2.25 2.25h8.5A2.25 2.25 0 0 0 18.5 18.5V8z" />
      <path d="M14 3.25V8h4.5" />
      <path d="M8.75 12.5h6.5" />
      <path d="M8.75 16h4" />
    </FormatIconBase>
  );
}

/** .pdf — document exported as an attachment. */
export function PdfFormatIcon(props: FormatIconProps) {
  return (
    <FormatIconBase {...props}>
      <path d="M14 3.25H7.75A2.25 2.25 0 0 0 5.5 5.5v13a2.25 2.25 0 0 0 2.25 2.25h8.5A2.25 2.25 0 0 0 18.5 18.5V8z" />
      <path d="M14 3.25V8h4.5" />
      <path d="M12 11.75v4.5" />
      <path d="M9.75 13.75 12 16l2.25-2.25" />
    </FormatIconBase>
  );
}

export type FormatIcon = (props: FormatIconProps) => ReactElement;

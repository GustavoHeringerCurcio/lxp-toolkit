import type { ReactElement, ReactNode, SVGProps } from "react";
import { cn } from "cn";

/**
 * Custom icon set for the send-confirmation flow.
 *
 * Deliberately not lucide: the whole modal draws from one hand-tuned family —
 * 24px grid, 1.5 stroke, round caps/joins, `currentColor` only, and a soft
 * duotone fill (`fillOpacity .12`) on the "body" shape of each glyph. Keep every
 * glyph here so the set stays consistent.
 */

type SendIconProps = SVGProps<SVGSVGElement>;

function IconBase({ className, children, ...props }: SendIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
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

/** Submit — paper plane. */
export function SendIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M20.5 3.5 13.8 20.4 10.9 13.9 4.6 11 20.5 3.5Z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path d="M20.5 3.5 10.9 13.9" />
    </IconBase>
  );
}

/** Irreversible action — warning. */
export function WarningIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M10.6 3.9 2.7 17.7A1.6 1.6 0 0 0 4.1 20.1h15.8a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path d="M12 9.5v4.25" />
      <path d="M12 16.75h.01" />
    </IconBase>
  );
}

/** Direct text — the portal's answer field. */
export function TextIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <rect
        x="3.25"
        y="4.75"
        width="17.5"
        height="14.5"
        rx="3.25"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path d="M7 9.5h7" />
      <path d="M7 13.5h4.5" />
      <path d="M16.25 8.75v6.5" />
    </IconBase>
  );
}

/** .txt — plain document. */
export function TxtIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M13.75 3.5H7.5A2.25 2.25 0 0 0 5.25 5.75v12.5A2.25 2.25 0 0 0 7.5 20.5h9a2.25 2.25 0 0 0 2.25-2.25V8.5z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path d="M13.75 3.5v5h5" />
      <path d="M8.75 12.5h6.5" />
      <path d="M8.75 16h4" />
    </IconBase>
  );
}

/** .pdf — document sealed as a file. */
export function PdfIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M13.75 3.5H7.5A2.25 2.25 0 0 0 5.25 5.75v12.5A2.25 2.25 0 0 0 7.5 20.5h9a2.25 2.25 0 0 0 2.25-2.25V8.5z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path d="M13.75 3.5v5h5" />
      <circle cx="12" cy="14.75" r="2.75" fill="currentColor" />
    </IconBase>
  );
}

/** "Fill" — the exercise completed in place (form + check). */
export function FillIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M13.75 3.5H7.5A2.25 2.25 0 0 0 5.25 5.75v12.5A2.25 2.25 0 0 0 7.5 20.5h9a2.25 2.25 0 0 0 2.25-2.25V8.5z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path d="M13.75 3.5v5h5" />
      <path d="M8.75 12.5h3" />
      <path d="M8.75 16h2" />
      <path d="m13.25 15.75 1.75 1.75 3-3.5" />
    </IconBase>
  );
}

/** Preview an artifact. */
export function EyeIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 5.5C7.1 5.5 3.6 9 2.25 12c1.35 3 4.85 6.5 9.75 6.5s8.4-3.5 9.75-6.5C20.4 9 16.9 5.5 12 5.5Z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </IconBase>
  );
}

/** Download an artifact. */
export function DownloadIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4.5 14.75v3.5A2.25 2.25 0 0 0 6.75 20.5h10.5a2.25 2.25 0 0 0 2.25-2.25v-3.5Z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path d="M12 3.75v10.75" />
      <path d="m7.9 10.4 4.1 4.1 4.1-4.1" />
    </IconBase>
  );
}

/** Dismiss the dialog. */
export function CloseIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="M17.5 6.5 6.5 17.5" />
    </IconBase>
  );
}

/** Selected format marker. */
export function CheckIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path d="m5.75 12.5 4.25 4.25L18.25 8" />
    </IconBase>
  );
}

/** Loading — caller adds `animate-spin`. */
export function SpinnerIcon(props: SendIconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.25a8.75 8.75 0 1 0 8.75 8.75" />
    </IconBase>
  );
}

export type SendGlyph = (props: SendIconProps) => ReactElement;

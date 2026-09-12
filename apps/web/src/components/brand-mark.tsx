import { cn } from "@/lib/utils";

/**
 * LXP Toolkit mark — "Stacked X": a rounded tile with two offset diagonals
 * forming an X, the back one translucent to read as layers/toolkit. Uses theme
 * tokens so it inverts correctly in dark mode. Mirrored by `public/favicon.svg`.
 */
export function BrandMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect width="64" height="64" rx="15" className="fill-primary" />
      <g
        stroke="var(--primary-foreground)"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.42"
        transform="translate(2.5 2.5)"
      >
        <line x1="20" y1="20" x2="44" y2="44" />
        <line x1="44" y1="20" x2="20" y2="44" />
      </g>
      <g stroke="var(--primary-foreground)" strokeWidth="7" strokeLinecap="round">
        <line x1="20" y1="20" x2="44" y2="44" />
        <line x1="44" y1="20" x2="20" y2="44" />
      </g>
    </svg>
  );
}

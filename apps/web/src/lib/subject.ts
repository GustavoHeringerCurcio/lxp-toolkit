import type { CSSProperties } from "react";

/**
 * Deterministic subject (module) identity — the single per-card color.
 *
 * Color is keyed by the module name, so a subject keeps the same identity across
 * pages and themes. The palette lives as theme tokens (`--subject-1..8` in
 * `index.css`), so there is no raw color in TSX (DESIGN.md §7).
 */

const COUNT = 8;

/** Optional explicit pin for known modules, to keep a subject stable forever. */
const OVERRIDES: Record<string, number> = {};

/** FNV-1a — stable, dependency-free string hash. */
function hash(key: string): number {
  let h = 2166136261;
  for (const ch of key) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Palette slot (0-based) for a module. */
export function subjectIndex(moduleName: string | null | undefined): number {
  const key = (moduleName ?? "").trim();
  if (!key) return 0;
  const pinned = OVERRIDES[key];
  if (pinned != null) return ((pinned % COUNT) + COUNT) % COUNT;
  return hash(key) % COUNT;
}

/** Inline custom property consumed by the `.subject-*` helpers in index.css. */
export function subjectStyle(moduleName: string | null | undefined): CSSProperties {
  return { "--subj": `var(--subject-${subjectIndex(moduleName) + 1})` } as CSSProperties;
}

const CONNECTIVES = /^(de|da|do|das|dos|e|a|o|as|os|à|às|ao|aos|em|no|na|nos|nas)$/i;

/** 1–2 letter monogram for a module, skipping pt-BR connectives. */
export function subjectInitials(moduleName: string | null | undefined): string {
  const words = (moduleName ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !CONNECTIVES.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

import type { CSSProperties } from "react";

/**
 * Deterministic subject (module) identity — the single per-card color.
 *
 * Color is keyed by the module name, so a subject keeps the same identity across
 * pages and themes. The palette lives as theme tokens (`--subject-1..12` in
 * `index.css`), so there is no raw color in TSX (DESIGN.md §7).
 *
 * A bare hash collides: two different modules can land on the same slot (e.g.
 * "Projeto" and "Desenvolvimento Back-end" both hashed to slot 1). The provider
 * in `subject-colors.tsx` therefore resolves the whole module set at once with
 * `assignSubjectIndices`, giving every module a distinct slot while keeping the
 * hash as a stable starting point.
 */

const COUNT = 12;

/** Number of slots in the subject palette. */
export function subjectCount(): number {
  return COUNT;
}

/** Optional explicit pin for known modules, to keep a subject stable forever. */
const OVERRIDES: Record<string, number> = {};

/** Normalized lookup key shared by the hash and the collision-free assignment. */
export function normalizeModuleKey(moduleName: string | null | undefined): string {
  return (moduleName ?? "").trim();
}

/** FNV-1a — stable, dependency-free string hash. */
function hash(key: string): number {
  let h = 2166136261;
  for (const ch of key) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Preferred (hash-based) palette slot for a module, before collision probing. */
function preferredSlot(key: string): number {
  const pinned = OVERRIDES[key];
  if (pinned != null) return ((pinned % COUNT) + COUNT) % COUNT;
  return hash(key) % COUNT;
}

/**
 * Palette slot (0-based) for a module, computed in isolation.
 *
 * This is the fallback used outside a `SubjectColorProvider`. Prefer
 * `useSubjectIndex`/`useSubjectStyle` so the visible module set stays
 * collision-free.
 */
export function subjectIndex(moduleName: string | null | undefined): number {
  const key = normalizeModuleKey(moduleName);
  if (!key) return 0;
  return preferredSlot(key);
}

/**
 * Assign every module in a set its own palette slot (0-based).
 *
 * Modules are processed in preferred-slot order; each claims its hash slot when
 * free and otherwise probes forward, so no two modules share a color as long as
 * the set is no larger than the palette. Ordering is locale-independent, making
 * the result stable across reloads for a given set of modules.
 */
export function assignSubjectIndices(
  moduleNames: Iterable<string | null | undefined>,
): Map<string, number> {
  const names = [...new Set([...moduleNames].map(normalizeModuleKey).filter(Boolean))];
  names.sort((a, b) => {
    const pa = preferredSlot(a);
    const pb = preferredSlot(b);
    if (pa !== pb) return pa - pb;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const used = new Set<number>();
  const map = new Map<string, number>();
  for (const name of names) {
    const start = preferredSlot(name);
    let slot = start;
    for (let i = 0; i < COUNT; i++) {
      const candidate = (start + i) % COUNT;
      if (!used.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    used.add(slot);
    map.set(name, slot);
  }
  return map;
}

/** Inline custom property for an explicit palette slot (0-based). */
export function subjectStyleForIndex(index: number): CSSProperties {
  const safe = ((index % COUNT) + COUNT) % COUNT;
  return { "--subj": `var(--subject-${safe + 1})` } as CSSProperties;
}

/** Inline custom property consumed by the `.subject-*` helpers in index.css. */
export function subjectStyle(moduleName: string | null | undefined): CSSProperties {
  return subjectStyleForIndex(subjectIndex(moduleName));
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

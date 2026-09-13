import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAppData } from "@/lib/app-state";
import {
  assignSubjectIndices,
  normalizeModuleKey,
  subjectIndex,
  subjectStyleForIndex,
} from "@/lib/subject";
import type { CSSProperties } from "react";

/**
 * Module → palette slot, resolved for the whole visible module set.
 *
 * A per-name hash alone collides (two modules can share a color), so the
 * provider assigns distinct slots across every module the user has. Consumers
 * read it through the hooks below; without a provider they fall back to the
 * deterministic hash.
 */
const SubjectColorContext = createContext<Map<string, number> | null>(null);

const EMPTY_MAP: Map<string, number> = new Map();

export function SubjectColorProvider({ children }: { children: ReactNode }) {
  const { items } = useAppData();
  const slots = useMemo(
    () => assignSubjectIndices(items.map((e) => e.moduleName)),
    [items],
  );
  return <SubjectColorContext.Provider value={slots}>{children}</SubjectColorContext.Provider>;
}

/** Collision-free slot map for the current module set (empty outside a provider). */
export function useSubjectColorMap(): Map<string, number> {
  return useContext(SubjectColorContext) ?? EMPTY_MAP;
}

/** Collision-free palette slot (0-based) for a module. */
export function useSubjectIndex(moduleName: string | null | undefined): number {
  const map = useSubjectColorMap();
  const mapped = map.get(normalizeModuleKey(moduleName));
  return mapped ?? subjectIndex(moduleName);
}

/** Collision-free inline custom property for a module. */
export function useSubjectStyle(moduleName: string | null | undefined): CSSProperties {
  return subjectStyleForIndex(useSubjectIndex(moduleName));
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchConfig, fetchExercises, fetchProfessorLinks } from "@/api";
import type { AiConfigDto, Exercise, ExerciseKind, ProfessorLink } from "@/types";

export type Scope = "open" | "expired" | "done" | "all";

interface AppDataValue {
  items: Exercise[];
  /** God's Eye: harvested topics the portal does not list in the tree. */
  hiddenItems: Exercise[];
  cfg: AiConfigDto | null;
  professorLinks: ProfessorLink[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  patchExercise: (id: number, patch: Partial<Exercise>) => void;
  patchConfig: (patch: Partial<AiConfigDto>) => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

interface ScopeValue {
  scope: Scope;
  setScope: (s: Scope) => void;
  moduleFilter: string | null;
  setModuleFilter: (m: string | null) => void;
  typeFilter: ExerciseKind | null;
  setTypeFilter: (t: ExerciseKind | null) => void;
}

const ScopeContext = createContext<ScopeValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Exercise[]>([]);
  const [hiddenItems, setHiddenItems] = useState<Exercise[]>([]);
  const [cfg, setCfg] = useState<AiConfigDto | null>(null);
  const [professorLinks, setProfessorLinks] = useState<ProfessorLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("open");
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ExerciseKind | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c, links] = await Promise.all([
        fetchExercises(),
        fetchConfig(),
        fetchProfessorLinks(),
      ]);
      setItems(p.exercises.filter((e) => e.origin !== "hidden"));
      setHiddenItems(p.exercises.filter((e) => e.origin === "hidden"));
      setCfg(c);
      setProfessorLinks(links);
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [p, c, links] = await Promise.all([
        fetchExercises(),
        fetchConfig(),
        fetchProfessorLinks(),
      ]);
      setItems(p.exercises.filter((e) => e.origin !== "hidden"));
      setHiddenItems(p.exercises.filter((e) => e.origin === "hidden"));
      setCfg(c);
      setProfessorLinks(links);
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const patchExercise = useCallback((id: number, patch: Partial<Exercise>) => {
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const patchConfig = useCallback((patch: Partial<AiConfigDto>) => {
    setCfg((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const dataValue = useMemo<AppDataValue>(
    () => ({ items, hiddenItems, cfg, professorLinks, loading, error, reload, refresh, patchExercise, patchConfig }),
    [items, hiddenItems, cfg, professorLinks, loading, error, reload, refresh, patchExercise, patchConfig],
  );

  const scopeValue = useMemo<ScopeValue>(
    () => ({ scope, setScope, moduleFilter, setModuleFilter, typeFilter, setTypeFilter }),
    [scope, moduleFilter, typeFilter],
  );

  return (
    <AppDataContext.Provider value={dataValue}>
      <ScopeContext.Provider value={scopeValue}>{children}</ScopeContext.Provider>
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData fora de AppProviders");
  return ctx;
}

export function useScopePrefs(): ScopeValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScopePrefs fora de AppProviders");
  return ctx;
}

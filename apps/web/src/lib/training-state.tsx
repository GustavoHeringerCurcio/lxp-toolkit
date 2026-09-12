import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useLocalStorage } from "@/lib/use-local-storage";

interface TrainingValue {
  courseId: number | null;
  moduleId: number | null;
  setCourseId: (id: number | null) => void;
  setModuleId: (id: number | null) => void;
}

const TrainingContext = createContext<TrainingValue | null>(null);

/**
 * The shared "subject switch" for the Treino routes: which course (and optional
 * module) the AI should become an expert on. Persisted so both pages agree.
 */
export function TrainingProvider({ children }: { children: ReactNode }) {
  const [courseId, setCourseIdRaw] = useLocalStorage<number | null>("lxp.training.course", null);
  const [moduleId, setModuleIdRaw] = useLocalStorage<number | null>("lxp.training.module", null);

  const setCourseId = useCallback(
    (id: number | null) => {
      setCourseIdRaw(id);
      setModuleIdRaw(null);
    },
    [setCourseIdRaw, setModuleIdRaw],
  );
  const setModuleId = useCallback((id: number | null) => setModuleIdRaw(id), [setModuleIdRaw]);

  const value = useMemo<TrainingValue>(
    () => ({ courseId, moduleId, setCourseId, setModuleId }),
    [courseId, moduleId, setCourseId, setModuleId],
  );

  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

export function useTrainingState(): TrainingValue {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error("useTrainingState fora de TrainingProvider");
  return ctx;
}

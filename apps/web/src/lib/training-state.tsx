import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useLocalStorage } from "@/lib/use-local-storage";
import type { SummarySize } from "@/types";

interface TrainingValue {
  courseId: number | null;
  moduleId: number | null;
  examId: number | null;
  summarySize: SummarySize;
  setCourseId: (id: number | null) => void;
  setModuleId: (id: number | null) => void;
  setExamId: (id: number | null) => void;
  setSummarySize: (size: SummarySize) => void;
}

const TrainingContext = createContext<TrainingValue | null>(null);

/**
 * The shared "subject switch" for the Treino/Resumo routes: which course, which
 * subject (module), which exam phase (Prova) and which Resumo size the AI
 * should focus on. Persisted so every page agrees.
 */
export function TrainingProvider({ children }: { children: ReactNode }) {
  const [courseId, setCourseIdRaw] = useLocalStorage<number | null>("lxp.training.course", null);
  const [moduleId, setModuleIdRaw] = useLocalStorage<number | null>("lxp.training.module", null);
  const [examId, setExamIdRaw] = useLocalStorage<number | null>("lxp.training.exam", null);
  const [summarySize, setSummarySizeRaw] = useLocalStorage<SummarySize>(
    "lxp.training.summary.size",
    "medium",
  );

  const setCourseId = useCallback(
    (id: number | null) => {
      setCourseIdRaw(id);
      setModuleIdRaw(null);
      setExamIdRaw(null);
    },
    [setCourseIdRaw, setModuleIdRaw, setExamIdRaw],
  );
  const setModuleId = useCallback((id: number | null) => setModuleIdRaw(id), [setModuleIdRaw]);
  const setExamId = useCallback((id: number | null) => setExamIdRaw(id), [setExamIdRaw]);
  const setSummarySize = useCallback((size: SummarySize) => setSummarySizeRaw(size), [setSummarySizeRaw]);

  const value = useMemo<TrainingValue>(
    () => ({
      courseId,
      moduleId,
      examId,
      summarySize,
      setCourseId,
      setModuleId,
      setExamId,
      setSummarySize,
    }),
    [courseId, moduleId, examId, summarySize, setCourseId, setModuleId, setExamId, setSummarySize],
  );

  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

export function useTrainingState(): TrainingValue {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error("useTrainingState fora de TrainingProvider");
  return ctx;
}

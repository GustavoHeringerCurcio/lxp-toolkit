import type { Exercise, QuizQ } from "../src/types.js";

export function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    title: "Atividade Teste",
    kind: "upload",
    flavor: "question",
    flavorSource: "auto",
    enrollmentId: null,
    isSurvey: false,
    contentKind: "other",
    isRecordProgress: false,
    courseId: 10,
    courseName: "Curso Teste",
    moduleId: 20,
    moduleTitle: "Módulo 1",
    moduleName: "M1",
    professor: null,
    professorId: null,
    sectionId: null,
    sectionTitle: null,
    topicTypeId: 8,
    status: "open",
    done: false,
    hasDeadline: false,
    deadlineAt: "2026-12-01T23:59:59Z",
    daysLeft: 5,
    files: [],
    remoteFiles: [],
    instructionsText: "Escreva um texto sobre X.",
    questions: [],
    forum: null,
    ai: { status: "none", answer: null, updatedAt: null },
    ...overrides,
  };
}

export function makeQuizQ(id: number, text: string, optionCount = 3): QuizQ {
  return {
    id,
    text,
    options: Array.from({ length: optionCount }, (_, i) => ({
      id: id * 100 + i,
      text: `Opção ${String.fromCharCode(97 + i)}`,
    })),
  };
}

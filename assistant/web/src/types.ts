export type ExerciseStatus = "done" | "expired" | "open";

export interface PdfRef {
  name: string;
  relPath: string;
  remoteUrl: string;
}

export interface QuizQ {
  id: number;
  text: string;
  options: string[];
}

export interface Exercise {
  id: number;
  title: string;
  kind: "upload" | "quiz";
  courseId: number;
  courseName: string;
  moduleTitle: string;
  moduleName: string;
  professor: string | null;
  sectionTitle: string | null;
  topicTypeId: number;
  status: ExerciseStatus;
  done: boolean;
  hasDeadline: boolean;
  deadlineAt: string | null;
  daysLeft: number | null;
  files: PdfRef[];
  remoteFiles: { filename: string | null; url: string }[];
  instructionsText: string;
  questions: QuizQ[];
  answer: string | null;
  notes: string;
}

export interface ExercisesPayload {
  generatedAt: string;
  exercises: Exercise[];
}

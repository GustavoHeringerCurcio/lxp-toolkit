export type ExerciseKind = "upload" | "quiz";
export type ExerciseStatus = "done" | "expired" | "open";

export interface PdfRef {
  name: string;
  /** path relative to repo root (used for the /docs URL) */
  relPath: string;
  /** absolute path on disk (used for text extraction) */
  absPath: string;
  /** remote URL on the LXP static host */
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
  kind: ExerciseKind;
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  moduleName: string;
  professor: string | null;
  sectionId: number | null;
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
  ai: { status: "none" | "generating" | "done" | "error"; answer: string | null; updatedAt: string | null };
}

export interface AiConfig {
  provider: "openai";
  model: string;
  temperature: number;
  language: string;
  system_prompt: string;
  max_output_tokens?: number;
}

export interface OverridesEntry {
  notes?: string;
  promptOverride?: string;
  hide?: boolean;
  tag?: string;
  manualStatus?: ExerciseStatus;
}

export type Overrides = Record<string, OverridesEntry>;
export type Answers = Record<string, { answer: string; updatedAt: string }>;

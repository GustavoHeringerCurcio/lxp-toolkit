export type ExerciseKind = "upload" | "quiz";
export type ExerciseStatus = "done" | "expired" | "open";
export type AnswerSource = "ai" | "manual";

export interface AiProfile {
  nome: string;
  matricula: string;
}

/**
 * Per-exercise / global AI request. May be stored as JSON (legacy/default) or,
 * more recently, as a single free-form text block in `prompt`. `perfil`,
 * `instrucoes`, `contexto` and `prompt` all receive the same {nome}/{matricula}
 * placeholder substitution as the rest of the prompt. When `prompt` is set it
 * is used verbatim as the "aluno" block and the structured fields are ignored.
 */
export interface AiRequest {
  perfil: string;
  instrucoes: string[];
  contexto: string;
  /** Full plain-text request block. Takes precedence over the structured fields. */
  prompt?: string;
}

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
  /** JSON string of the default per-exercise AiRequest (seeded when no override). */
  ai_request_default?: string;
}

export interface OverridesEntry {
  notes?: string;
  promptOverride?: string;
  hide?: boolean;
  tag?: string;
  manualStatus?: ExerciseStatus;
  /** Raw JSON string of the per-exercise AiRequest override. */
  aiRequest?: string;
}

export type Overrides = Record<string, OverridesEntry>;

export interface AnswerEntry {
  answer: string;
  updatedAt: string;
  source?: AnswerSource;
}

export interface AnswerRecord extends AnswerEntry {
  history: AnswerEntry[];
}

export type Answers = Record<string, AnswerRecord>;

export interface SubmissionEntry {
  exerciseId: number;
  at: string;
  status: "running" | "ok" | "unknown" | "failed";
  detail: string;
}
export type Submissions = Record<string, SubmissionEntry[]>;

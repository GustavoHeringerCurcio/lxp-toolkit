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

/** One chosen option for a quiz question (optionIndex is 0-based). */
export interface QuizSelection {
  questionId: number;
  optionIndex: number;
  letter: string;
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
  max_output_tokens?: number;
  /**
   * The style rules ("Como escrever") edited on the activity screen. Combined
   * with `activity_template` to form the single `user` message sent to the model.
   */
  message_template: string;
  /**
   * The activity scaffolding (sections + {placeholders}) appended after the style
   * rules. Edited only in "IA Ajustes".
   */
  activity_template: string;
  /** Named message templates: display name -> full plain-text message. */
  ai_templates?: Record<string, string>;
  /** @deprecated ignored; kept only so old config files load without errors. */
  language?: string;
  /** @deprecated ignored; kept only so old config files load without errors. */
  system_prompt?: string;
  /** @deprecated renamed to message_template; read as a fallback. */
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
  /** Quiz answer selections (empty for upload tasks). */
  selections?: QuizSelection[];
}

export interface AnswerRecord extends AnswerEntry {
  history: AnswerEntry[];
}

export type Answers = Record<string, AnswerRecord>;

export type SubmissionStatus = "running" | "ok" | "already" | "unknown" | "failed";

export interface SubmissionEntry {
  exerciseId: number;
  at: string;
  status: SubmissionStatus;
  detail: string;
  /** What was submitted (answer text), for the history. */
  answer?: string;
  /** Attachment filename registered by the portal. */
  attachmentName?: string;
  /** Attempt number reported by the portal, when known. */
  attemptNumber?: number | null;
  /** Portal page detail (e.g. success banner) captured by the runner. */
  portalDetail?: string;
  /** When the portal confirmed the submission. */
  confirmationAt?: string;
}
export type Submissions = Record<string, SubmissionEntry[]>;

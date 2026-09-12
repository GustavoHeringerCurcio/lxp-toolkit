/**
 * Coarse action bucket the UI filters/badges on:
 * - `upload` — file-upload task (topicTypeId 8)
 * - `quiz`   — questionnaire / pre/post-test / exercises (15, 29, 30, 37)
 * - `mark`   — manually "mark as completed" content (recordable pdf/reading/link/other)
 * - `forum`  — forum topic (topicTypeId 9): read the thread, publish a reply
 * - `other`  — anything actionable that is neither
 */
export type ExerciseKind = "quiz" | "upload" | "mark" | "forum" | "other";

/** Raw portal content classification (`src/content.ts::classify`). */
export type ContentKind = "pdf" | "reading" | "quiz" | "file_upload" | "link" | "forum" | "other";

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

export interface QuizOption {
  /** Portal option id (used by the submit endpoint). */
  id: number;
  text: string;
}

export interface QuizQ {
  id: number;
  text: string;
  options: QuizOption[];
}

/** One chosen option for a quiz question (optionIndex is 0-based). */
export interface QuizSelection {
  questionId: number;
  optionIndex: number;
  letter: string;
  /** Portal option id of the chosen alternative. */
  optionId: number;
}

/** One forum publication (top-level post or nested reply via `children`). */
export interface ForumPost {
  id: number;
  topicId: number;
  html: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  /** Author enrollment — the id that appears in `enrollmentIdsWhoLiked`. */
  enrollmentId: number;
  /** `null` = top-level post; set = reply to another post. */
  parentPostId: number | null;
  isHidden: boolean;
  isDeleted: boolean;
  postOwnerUsername: string;
  postOwnerProfilePhoto: string | null;
  postOwnerSafeaRole: string | null;
  postOwnerRoleName: string | null;
  children: ForumPost[];
  enrollmentIdsWhoLiked: number[];
}

/** Forum state (from the topic detail `content` + dump-time thread fetch). */
export interface ForumInfo {
  countPosts: number;
  countOfMyPosts: number;
  isAllowLikes: boolean;
  isToLimitResponses: boolean;
  maxAnswerPerStudent: number;
  isOnlyVisibleToPeopleWithPost: boolean;
  hasReachedPostLimit: boolean;
  posts: ForumPost[];
}

export interface Exercise {
  id: number;
  title: string;
  kind: ExerciseKind;
  /** Portal enrollment id (from the topic context); required to submit quizzes. */
  enrollmentId: number | null;
  /** A "Pesquisa": answered straight through the endpoint, no attempt/finish cycle. */
  isSurvey: boolean;
  /** Raw content classification (pdf/reading/link/forum/other/quiz/file_upload). */
  contentKind: ContentKind;
  /** Whether the portal records progress for this item (drives "mark as completed"). */
  isRecordProgress: boolean;
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleTitle: string;
  moduleName: string;
  professor: string | null;
  /** Stable professor id (`context.teachers[].safeaUserId`); null when unresolved. */
  professorId: number | null;
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
  /** Forum state when `contentKind === "forum"`, else null. */
  forum: ForumInfo | null;
  ai: { status: "none" | "generating" | "done" | "error"; answer: string | null; updatedAt: string | null };
}

/**
 * The writing rules sent as the `system` message. Structured so the UI can edit
 * it with cards/inputs instead of a free-text blob full of section markers.
 */
export interface AiStyle {
  /** Who the model is pretending to be. */
  persona: string;
  /** Tone/language guidance. */
  voice: string;
  /** Start the answer with "Nome: ..." and "Matrícula: ...". */
  includeIdentity: boolean;
  /** How to answer multiple-choice questions. */
  mcqMode: "letter" | "letter_text";
  /** Prefix each answer with its question number. */
  numbering: boolean;
  /** Association questions: "item - answer" on the same line. */
  associateInline: boolean;
  /** No greeting, closing or extra offers. */
  noIntroOutro: boolean;
  /** Do not repeat the activity context labels in the answer. */
  noMetaLabels: boolean;
  /** Extra free-form rules, one per line. */
  extraRules: string;
}

/** Which parts of the activity are sent as the `user` message. */
export interface AiActivitySections {
  enunciado: boolean;
  arquivos: boolean;
  questoes: boolean;
  observacoes: boolean;
}

export interface AiConfig {
  provider: "openai";
  model: string;
  temperature: number;
  max_output_tokens?: number;
  /** Structured writing rules (system message). */
  style: AiStyle;
  /** Which activity sections are included in the user message. */
  activitySections: AiActivitySections;
  /** @deprecated legacy free-text style; replaced by `style`. */
  message_template?: string;
  /** @deprecated legacy free-text scaffolding; replaced by `activitySections`. */
  activity_template?: string;
  /** @deprecated named-templates feature removed. */
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

export type SendMode = "text" | "txt" | "pdf";

export interface SubmissionEntry {
  exerciseId: number;
  at: string;
  status: SubmissionStatus;
  detail: string;
  /** What was submitted (answer text), for the history. */
  answer?: string;
  /** How the answer was delivered: typed, .txt attachment, or .pdf attachment. */
  mode?: SendMode;
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

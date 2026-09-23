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

/**
 * What a task actually requires, beyond its coarse `kind`:
 * - `question` — a real question to answer (AI text generation applies).
 * - `ghost`    — no question at all (slides/empty task): skip AI, submit a
 *                minimal "Nome / Matrícula" acknowledgment.
 * - `print`    — requires a screenshot/print the student must attach manually.
 */
export type UploadFlavor = "question" | "ghost" | "print";

/** Where the effective flavor came from: auto-detected, lazy AI review, or manual tag override. */
export type FlavorSource = "auto" | "ai" | "manual";

/**
 * A detected (or tagged) content anomaly. Extensible: new codes plug into the
 * same badge/override pipeline without UI changes. `severity` drives the badge
 * tone (`error` = red outline, `warn` = amber outline).
 */
export type AnomalyCode = "ghost" | "print";
export type AnomalySeverity = "error" | "warn";

export interface Anomaly {
  code: AnomalyCode;
  severity: AnomalySeverity;
}

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
  /** What the task actually requires (auto-detected or overridden by tag). */
  flavor: UploadFlavor;
  /** Where `flavor` came from: `auto` detection or a manual tag override. */
  flavorSource: FlavorSource;
  /** Content anomalies detected or tagged for this item (drives the badge). */
  anomalies: Anomaly[];
  /** Auto-detection was inconclusive: a lazy AI review should confirm the flavor. */
  needsReview: boolean;
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
  /** Sanitized HTML of the activity brief, for rich display (falls back to `instructionsText`). */
  instructionsHtml?: string;
  questions: QuizQ[];
  /** Forum state when `contentKind === "forum"`, else null. */
  forum: ForumInfo | null;
  ai: { status: "none" | "generating" | "done" | "error"; answer: string | null; updatedAt: string | null };
  /** `"hidden"` = harvested by God's Eye; the portal does not list it in the tree. */
  origin?: "tree" | "hidden";
  /** Gradebook activity id (`context.gradeBookId`) when the topic is graded. */
  gradebookId?: number | null;
  /** Topic-detail visibility flags (hidden harvest provenance). */
  isVisible?: boolean;
  isFuture?: boolean;
  /** Hidden harvest only: another tree item carries the same normalized title. */
  duplicate?: boolean;
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

// ── Project context ─────────────────────────────────────────────────────────

export type ProjectSource = "auto" | "manual";
export type ProjectProfileMode = "main" | "activity" | "none";

/** The student's MAIN project for a course (theme + actors + requirements). */
export interface ProjectProfile {
  courseId: number;
  theme: string;
  atores: string[];
  requisitos: string[];
  /** Themes suggested by the course material, used to populate the dropdown. */
  suggestedThemes: string[];
  source: ProjectSource;
  confidence: number | null;
  model: string | null;
  contentHash: string | null;
  updatedAt: string;
}

/** Per-activity project relevance, plus an optional quick project override. */
export interface ActivityProject {
  contentItemId: number;
  needsProject: boolean;
  /** True when the activity asks to fill a professor-provided template/table. */
  wantsTemplate: boolean;
  /** Field labels the professor wants, in order (empty when none). */
  templateFields: string[];
  profileMode: ProjectProfileMode;
  /** Quick project (used when `profileMode === "activity"`). */
  theme: string | null;
  atores: string[];
  requisitos: string[];
  confidence: number | null;
  intent: string | null;
  reason: string | null;
  source: ProjectSource;
  model: string | null;
  contentHash: string | null;
  updatedAt: string;
}

// ── External project source (Ajustes → Organização) ─────────────────────────

export type ProjectSourceFileStatus = "ok" | "empty" | "unsupported" | "error";
export type ProjectReadmeStatus = "ok" | "empty" | "error" | "none";

/** Global per-student project context: repo link + notes + fetched README. */
export interface ProjectSourceState {
  title: string;
  githubUrl: string;
  notes: string;
  readmeText: string;
  readmeStatus: ProjectReadmeStatus;
  readmeFetchedAt: string | null;
  updatedAt: string | null;
}

/** One uploaded project file with its extracted text status. */
export interface ProjectSourceFile {
  id: number;
  filename: string;
  mime: string | null;
  sizeBytes: number;
  status: ProjectSourceFileStatus;
  charCount: number;
  createdAt: string;
}

/** Every place the app calls a model, so each can use its own. */
export type AiModelRole = "generation" | "detection" | "classification" | "diagram" | "gate" | "training";

/** Role -> OpenAI model id. */
export type AiModels = Record<AiModelRole, string>;

// ── AI abilities (tools/skills the model can use) ───────────────────────────

/** A capability the AI can use on a draft. Extensible: add an id + registry entry. */
export type AbilityId = "uml_diagram";

/** Registry metadata for one ability (label/description for the UI). */
export interface AbilityMeta {
  id: AbilityId;
  label: string;
  description: string;
  /** Whether the ability is on by default for a fresh config. */
  defaultOn: boolean;
}

/** Global per-student ability switches, keyed by ability id. */
export type AbilitySettings = Record<string, boolean>;

/** Per-activity ability override row. */
export interface ActivityAbility {
  contentItemId: number;
  ability: AbilityId;
  enabled: boolean;
}

/** One deterministic rubric check on a draft (template/use-case aware). */
export interface GateCheck {
  /** Stable machine code, e.g. `fluxo_alternativo_ancorado`. */
  code: string;
  /** Human-facing label in Portuguese. */
  label: string;
  ok: boolean;
  /** Why it failed (empty when ok). */
  detail: string;
}

/**
 * Quality-gate analysis of a draft (cheap model). The overall `score` is
 * computed by the server, never taken from the model directly.
 */
export interface GateResult {
  /** Weighted 0–100 confidence that the answer is ready to send. */
  score: number;
  /** 0–100: does the writing sound natural (not robotic/generic)? */
  humanScore: number;
  /** 0–100: does it answer exactly what was asked? */
  relevanceScore: number;
  /** 0–100: does it cover everything the task requests? */
  completenessScore: number;
  verdict: "ready" | "review" | "weak";
  /** One-line assessment. */
  summary: string;
  issues: string[];
  suggestions: string[];
  model: string;
  /** Deterministic rubric checks (empty when the draft is not a template). */
  checks: GateCheck[];
  /** True when a full-context debug log was written for this draft. */
  logged?: boolean;
  /** Hash of the draft this analysis was produced from (for staleness checks). */
  draftHash?: string;
}

export interface AiConfig {
  provider: "openai";
  model: string;
  /** Per-purpose model overrides (see `AiModelRole`). */
  models: AiModels;
  temperature: number;
  max_output_tokens?: number;
  /** Auto-detect project context for answerable activities (default true). */
  projectAutoDetect?: boolean;
  /** Structured writing rules (system message). */
  style: AiStyle;
  /** Which activity sections are included in the user message. */
  activitySections: AiActivitySections;
  /** Global AI abilities (tools the model can use), keyed by ability id. */
  abilities: AbilitySettings;
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
  /** Cached lazy AI flavor classification (per student), when available. */
  autoFlavor?: UploadFlavor;
  /** One-line reason the AI classifier returned (for transparency/debugging). */
  autoFlavorReason?: string;
}

export type Overrides = Record<string, OverridesEntry>;

export interface AnswerEntry {
  answer: string;
  updatedAt: string;
  source?: AnswerSource;
  /** Quiz answer selections (empty for upload tasks). */
  selections?: QuizSelection[];
  /** Persisted quality-gate analysis of this answer version, when available. */
  gate?: GateResult | null;
}

export interface AnswerRecord extends AnswerEntry {
  history: AnswerEntry[];
}

export type Answers = Record<string, AnswerRecord>;

// ── Training ("Treino") ─────────────────────────────────────────────────────

export type TrainingQuizMode = "ai" | "mixed";

export interface TrainingOption {
  letter: string;
  text: string;
}

export interface TrainingQuestion {
  /** Local (DB) question id. */
  id: number;
  position: number;
  text: string;
  options: TrainingOption[];
  answerIndex: number;
  explanation: string | null;
  /** Portal content_item this question was sourced from (portal mode). */
  sourceItemId: number | null;
  sourceKind: string | null;
}

export interface TrainingQuiz {
  id: number;
  mode: TrainingQuizMode;
  title: string;
  subjectLabel: string;
  courseId: number;
  moduleId: number | null;
  total: number;
  score: number | null;
  completedAt: string | null;
  createdAt: string;
  questions: TrainingQuestion[];
}

export interface TrainingModuleInfo {
  moduleId: number;
  moduleName: string;
  itemCount: number;
  quizCount: number;
  readingCount: number;
}

export interface TrainingSubject {
  courseId: number;
  courseName: string;
  itemCount: number;
  quizCount: number;
  readingCount: number;
  modules: TrainingModuleInfo[];
}

export interface TrainingSubjectStats {
  courseId: number;
  courseName: string;
  attempts: number;
  bestPct: number;
  lastPct: number;
  lastAt: string;
}

export interface TrainingStats {
  attempts: number;
  bestPct: number | null;
  lastPct: number | null;
  lastAt: string | null;
  bySubject: TrainingSubjectStats[];
}

// ── Resumo (study summary) ──────────────────────────────────────────────────

/**
 * A saved study summary for one subject scope (course, or course + module).
 * `content` is AI-generated markdown covering the subject's strongest exam
 * topics; regenerate by upserting the same scope.
 */
export interface StudySummary {
  id: number;
  courseId: number;
  moduleId: number | null;
  subjectLabel: string;
  content: string;
  model: string | null;
  itemCount: number;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Professor photos (per student) ──────────────────────────────────────────

export type ProfessorLinkSource = "linkedin" | "manual";

export interface ProfessorLink {
  professorId: number;
  linkedinUrl: string | null;
  imageUrl: string | null;
  source: ProfessorLinkSource;
  updatedAt: string;
  /** Avatar URL for the browser (manual image, else unavatar). Empty when none. */
  photoUrl: string;
}

export type SubmissionStatus = "running" | "ok" | "already" | "unknown" | "failed";

export type SendMode = "text" | "txt" | "pdf" | "docx" | "image" | "fill";

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

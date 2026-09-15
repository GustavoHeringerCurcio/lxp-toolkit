export type ExerciseKind = "quiz" | "upload" | "mark" | "forum" | "other";
export type ContentKind = "pdf" | "reading" | "quiz" | "file_upload" | "link" | "forum" | "other";
export type ExerciseStatus = "done" | "expired" | "open";
export type AnswerSource = "ai" | "manual";

/** What a task actually requires: a real question, a ghost (no question), or a print/screenshot. */
export type UploadFlavor = "question" | "ghost" | "print";
export type FlavorSource = "auto" | "ai" | "manual";

/** A detected or tagged content anomaly (drives the combined activity badge). */
export type AnomalyCode = "ghost" | "print";
export type AnomalySeverity = "error" | "warn";

export interface Anomaly {
  code: AnomalyCode;
  severity: AnomalySeverity;
}

export interface AiProfile {
  nome: string;
  matricula: string;
}

export interface AiRequest {
  perfil: string;
  instrucoes: string[];
  contexto: string;
  /** Full plain-text request block. Takes precedence over the structured fields. */
  prompt?: string;
}

export interface PdfRef {
  name: string;
  relPath: string;
  remoteUrl: string;
}

export interface RemoteFile {
  filename: string | null;
  url: string;
}

export interface QuizOption {
  id: number;
  text: string;
}

export interface QuizQ {
  id: number;
  text: string;
  options: QuizOption[];
}

export interface QuizSelection {
  questionId: number;
  optionIndex: number;
  letter: string;
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
  enrollmentId: number;
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
  /** Manual anomaly tag (ghost | print | anomalia), or null. */
  tag: string | null;
  enrollmentId: number | null;
  isSurvey: boolean;
  contentKind: ContentKind;
  isRecordProgress: boolean;
  courseId: number;
  courseName: string;
  moduleTitle: string;
  moduleName: string;
  professor: string | null;
  /** Stable professor id (`context.teachers[].safeaUserId`); null when unresolved. */
  professorId: number | null;
  /** Configured professor photo URL (`/api/professor-avatar/…`), or null. */
  professorPhotoUrl?: string | null;
  sectionTitle: string | null;
  topicTypeId: number;
  status: ExerciseStatus;
  done: boolean;
  hasDeadline: boolean;
  deadlineAt: string | null;
  daysLeft: number | null;
  files: PdfRef[];
  remoteFiles: RemoteFile[];
  instructionsText: string;
  /** Sanitized HTML of the activity brief, for rich display (falls back to `instructionsText`). */
  instructionsHtml?: string;
  questions: QuizQ[];
  /** Forum state when `contentKind === "forum"`, else null. */
  forum: ForumInfo | null;
  answer: string | null;
  answerSource: AnswerSource | null;
  selections: QuizSelection[];
  notes: string;
  aiRequest: AiRequest;
  hasAiOverride: boolean;
  aiRequestJson: string;
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

export interface ExercisesPayload {
  generatedAt: string;
  exercises: Exercise[];
}

export interface AnswerEntry {
  answer: string;
  updatedAt: string;
  source: AnswerSource;
  selections?: QuizSelection[];
  /** Persisted quality-gate analysis of this answer version, when available. */
  gate?: GateResultDto | null;
}

export interface AnswerState {
  current: AnswerEntry | null;
  history: AnswerEntry[];
}

/** One deterministic rubric check on a draft. */
export interface GateCheckDto {
  code: string;
  label: string;
  ok: boolean;
  detail: string;
}

/** Quality-gate analysis of a draft (cheap model). */
export interface GateResultDto {
  /** Weighted 0–100 confidence that the answer is ready to send. */
  score: number;
  humanScore: number;
  relevanceScore: number;
  completenessScore: number;
  verdict: "ready" | "review" | "weak";
  summary: string;
  issues: string[];
  suggestions: string[];
  model: string;
  /** Deterministic rubric checks (empty for non-template drafts). */
  checks: GateCheckDto[];
  /** True when a full-context debug log was written for this draft. */
  logged?: boolean;
  /** Hash of the analyzed draft (used to detect a stale saved analysis). */
  draftHash?: string;
}

/** Recent weak-draft diagnostic (list view; payload omitted). */
export interface DebugLogDto {
  id: number;
  contentItemId: number | null;
  answerAttemptId: number | null;
  reason: string;
  filePath: string | null;
  createdAt: string;
}

/** Full diagnostic with its captured context. */
export interface DebugLogFullDto extends DebugLogDto {
  payload: unknown;
}

/** One use case node in a generated UML diagram. */
export interface DiagramUseCaseDto {
  name: string;
  actors: string[];
  includes: string[];
  extends: string[];
}

/** A generated UML use-case diagram (spec + rendered SVG). */
export interface DiagramDto {
  system: string;
  actors: string[];
  useCases: DiagramUseCaseDto[];
}

export interface DiagramArtifactDto {
  spec: DiagramDto;
  svg: string;
  /** PNG data URL, only when requested. */
  pngDataUrl: string | null;
}

/** Every place the app calls a model, so each can use its own. */
export type AiModelRole = "generation" | "detection" | "classification" | "diagram" | "gate" | "training";

/** Role -> OpenAI model id. */
export type AiModels = Record<AiModelRole, string>;

export interface AiStyle {
  persona: string;
  voice: string;
  includeIdentity: boolean;
  mcqMode: "letter" | "letter_text";
  numbering: boolean;
  associateInline: boolean;
  noIntroOutro: boolean;
  noMetaLabels: boolean;
  extraRules: string;
}

export interface AiActivitySections {
  enunciado: boolean;
  arquivos: boolean;
  questoes: boolean;
  observacoes: boolean;
}

export type AbilityId = "uml_diagram";

/** Registry metadata for one AI ability/tool. */
export interface AbilityMeta {
  id: AbilityId;
  label: string;
  description: string;
  defaultOn: boolean;
}

/** Global ability switches, keyed by ability id. */
export type AbilitySettings = Record<string, boolean>;

export interface AiConfigDto {
  model: string;
  /** Per-purpose model overrides. */
  models: AiModels;
  configPath: string;
  max_output_tokens?: number;
  temperature?: number;
  style: AiStyle;
  activitySections: AiActivitySections;
  /** Auto-detect project context for answerable activities. */
  projectAutoDetect: boolean;
  /** Global AI ability switches. */
  abilities: AbilitySettings;
  /** Ability registry (labels/descriptions for the UI). */
  abilityRegistry: AbilityMeta[];
  profile: AiProfile;
}

// ── Project context ─────────────────────────────────────────────────────────

export type ProjectSource = "auto" | "manual";
export type ProjectProfileMode = "main" | "activity" | "none";

/** The student's MAIN project for a course. */
export interface ProjectProfileDto {
  courseId: number;
  theme: string;
  atores: string[];
  requisitos: string[];
  suggestedThemes: string[];
  source: ProjectSource;
  confidence: number | null;
  model: string | null;
  contentHash: string | null;
  updatedAt: string;
}

/** Per-activity relevance + optional quick project override. */
export interface ActivityProjectDto {
  contentItemId: number;
  needsProject: boolean;
  profileMode: ProjectProfileMode;
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

export interface EffectiveProfileDto {
  theme: string;
  atores: string[];
  requisitos: string[];
  origin: "main" | "activity";
}

export interface AnalyzeResultDto {
  ok: boolean;
  needsProject: boolean;
  confidence: number | null;
  intent: string | null;
  reason: string | null;
  source: ProjectSource;
  mainProfile: ProjectProfileDto | null;
  activity: ActivityProjectDto;
  proposed: { theme: string; atores: string[]; requisitos: string[] } | null;
  effective: EffectiveProfileDto | null;
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

// ── Professor photos ────────────────────────────────────────────────────────

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

// ── Organizations (hardcoded directory) ─────────────────────────────────────

export type OrgMatchConfidence = "exact" | "probable" | "none";

export interface OrganizationProfessor {
  professorName: string;
  professorId: number | null;
  displayName: string | null;
  linkedin: string;
  photoUrl: string | null;
  confidence: OrgMatchConfidence;
  matched: boolean;
}

export interface OrganizationDto {
  id: string;
  name: string;
  host: string | null;
  logo: string | null;
  selected: boolean;
  professors: OrganizationProfessor[];
}

// ── Training ("Treino") ─────────────────────────────────────────────────────
export type TrainingQuizMode = "ai" | "mixed";

export interface TrainingOption {
  letter: string;
  text: string;
}

export interface TrainingQuestion {
  id: number;
  position: number;
  text: string;
  options: TrainingOption[];
  answerIndex: number;
  explanation: string | null;
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

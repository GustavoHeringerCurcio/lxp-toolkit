export type ExerciseKind = "quiz" | "upload" | "mark" | "forum" | "other";
export type ContentKind = "pdf" | "reading" | "quiz" | "file_upload" | "link" | "forum" | "other";
export type ExerciseStatus = "done" | "expired" | "open";
export type AnswerSource = "ai" | "manual";

/** What a task actually requires: a real question, a ghost (no question), or a print/screenshot. */
export type UploadFlavor = "question" | "ghost" | "print";
export type FlavorSource = "auto" | "manual";

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
}

export interface AnswerState {
  current: AnswerEntry | null;
  history: AnswerEntry[];
}

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

export interface AiConfigDto {
  model: string;
  configPath: string;
  max_output_tokens?: number;
  temperature?: number;
  style: AiStyle;
  activitySections: AiActivitySections;
  profile: AiProfile;
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

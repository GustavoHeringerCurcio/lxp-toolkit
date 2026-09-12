export type ExerciseKind = "quiz" | "upload" | "mark" | "forum" | "other";
export type ContentKind = "pdf" | "reading" | "quiz" | "file_upload" | "link" | "forum" | "other";
export type ExerciseStatus = "done" | "expired" | "open";
export type AnswerSource = "ai" | "manual";

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

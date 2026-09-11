export type ExerciseKind = "quiz" | "upload" | "mark" | "other";
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

export interface QuizQ {
  id: number;
  text: string;
  options: string[];
}

export interface QuizSelection {
  questionId: number;
  optionIndex: number;
  letter: string;
}

export interface Exercise {
  id: number;
  title: string;
  kind: ExerciseKind;
  contentKind: ContentKind;
  isRecordProgress: boolean;
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
  remoteFiles: RemoteFile[];
  instructionsText: string;
  questions: QuizQ[];
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

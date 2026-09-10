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
}

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
  answerSource: AnswerSource | null;
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
}

export interface AnswerState {
  current: AnswerEntry | null;
  history: AnswerEntry[];
}

export interface AiConfigDto {
  model: string;
  language: string;
  configPath: string;
  max_output_tokens?: number;
  temperature?: number;
  ai_request_default: string;
  profile: AiProfile;
}

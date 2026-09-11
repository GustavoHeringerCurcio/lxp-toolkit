import type { ContentKind, ExerciseKind } from "./types.js";

/** pt-BR labels for the coarse action buckets. */
export const KIND_LABEL: Record<ExerciseKind, string> = {
  quiz: "Quiz",
  upload: "Tarefa (envio de arquivo)",
  mark: "Marcar como concluída",
  other: "Outro",
};

/** pt-BR labels for the raw content classification. */
export const CONTENT_LABEL: Record<ContentKind, string> = {
  pdf: "PDF",
  reading: "Leitura",
  link: "Link",
  forum: "Fórum",
  other: "Conteúdo",
  quiz: "Quiz",
  file_upload: "Tarefa",
};

export function kindLabel(kind: ExerciseKind): string {
  return KIND_LABEL[kind];
}

/** Only tasks/quizzes have AI-answerable content. */
export function isAnswerable(kind: ExerciseKind): boolean {
  return kind === "quiz" || kind === "upload";
}

/**
 * Training persistence — quizzes, their questions and the student's answers.
 *
 * Postgres is the source of truth (see `store.ts`); this module is the training
 * slice of it: create a session, record the answers + score, and aggregate
 * readiness stats for the gamified UI.
 */
import { query, withTransaction } from "./db.js";
import { getStudentId } from "./store.js";
import type {
  TrainingOption,
  TrainingQuestion,
  TrainingQuiz,
  TrainingQuizMode,
  TrainingStats,
  TrainingSubjectStats,
} from "./types.js";

export interface NewTrainingQuestion {
  text: string;
  options: TrainingOption[];
  answerIndex: number;
  explanation: string | null;
  sourceItemId: number | null;
  sourceKind: string | null;
}

export interface NewTrainingQuiz {
  courseId: number;
  moduleId: number | null;
  mode: TrainingQuizMode;
  title: string;
  subjectLabel: string;
  questions: NewTrainingQuestion[];
}

interface QuizRow {
  id: string;
  mode: string;
  title: string;
  subject_label: string;
  course_id: string;
  module_id: string | null;
  total: number;
  score: number | null;
  completed_at: Date | null;
  created_at: Date;
}

interface QuestionRow {
  id: string;
  quiz_id: string;
  position: number;
  text: string;
  options: TrainingOption[] | null;
  answer_index: number;
  explanation: string | null;
  source_item_id: string | null;
  source_kind: string | null;
}

function toQuestion(r: QuestionRow): TrainingQuestion {
  return {
    id: Number(r.id),
    position: r.position,
    text: r.text,
    options: Array.isArray(r.options) ? r.options : [],
    answerIndex: r.answer_index,
    explanation: r.explanation,
    sourceItemId: r.source_item_id != null ? Number(r.source_item_id) : null,
    sourceKind: r.source_kind,
  };
}

function toQuiz(row: QuizRow, questions: TrainingQuestion[]): TrainingQuiz {
  return {
    id: Number(row.id),
    mode: row.mode === "mixed" ? "mixed" : "ai",
    title: row.title,
    subjectLabel: row.subject_label,
    courseId: Number(row.course_id),
    moduleId: row.module_id != null ? Number(row.module_id) : null,
    total: row.total,
    score: row.score,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    questions,
  };
}

/** Persist a generated quiz and its questions; returns it with local ids. */
export async function createTrainingQuiz(input: NewTrainingQuiz): Promise<TrainingQuiz> {
  const studentId = await getStudentId();
  const quizId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO training_quiz(
         student_id, course_id, module_id, mode, title, subject_label, question_count, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
      [
        studentId,
        input.courseId,
        input.moduleId,
        input.mode,
        input.title,
        input.subjectLabel,
        input.questions.length,
      ],
    );
    const id = Number(inserted.rows[0].id);
    for (let i = 0; i < input.questions.length; i++) {
      const q = input.questions[i];
      await client.query(
        `INSERT INTO training_question(
           quiz_id, position, text, options, answer_index, explanation, source_item_id, source_kind)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
        [
          id,
          i,
          q.text,
          JSON.stringify(q.options),
          q.answerIndex,
          q.explanation,
          q.sourceItemId,
          q.sourceKind,
        ],
      );
    }
    return id;
  });

  const quiz = await getTrainingQuiz(quizId);
  if (!quiz) throw new Error(`falha ao criar o treino ${quizId}`);
  return quiz;
}

export async function getTrainingQuiz(id: number): Promise<TrainingQuiz | null> {
  const rows = await query<QuizRow>("SELECT * FROM training_quiz WHERE id = $1", [id]);
  const row = rows[0];
  if (!row) return null;
  const questions = await query<QuestionRow>(
    "SELECT * FROM training_question WHERE quiz_id = $1 ORDER BY position",
    [id],
  );
  return toQuiz(row, questions.map(toQuestion));
}

export interface TrainingAnswerInput {
  questionId: number;
  chosenIndex: number | null;
  isCorrect: boolean;
}

/** Record the answers and final score for a completed quiz session. */
export async function completeTrainingQuiz(
  id: number,
  answers: TrainingAnswerInput[],
  score: number,
): Promise<void> {
  const studentId = await getStudentId();
  await withTransaction(async (client) => {
    const owned = await client.query<{ id: string }>(
      "SELECT id FROM training_quiz WHERE id = $1 AND student_id = $2",
      [id, studentId],
    );
    if (owned.rows.length === 0) throw new Error(`treino ${id} não encontrado`);

    await client.query("DELETE FROM training_answer WHERE quiz_id = $1", [id]);
    for (const a of answers) {
      await client.query(
        `INSERT INTO training_answer(quiz_id, question_id, chosen_index, is_correct)
         VALUES ($1,$2,$3,$4)`,
        [id, a.questionId, a.chosenIndex, a.isCorrect],
      );
    }
    await client.query(
      "UPDATE training_quiz SET score = $2, completed_at = now() WHERE id = $1",
      [id, score],
    );
  });
}

interface StatRow {
  course_id: string;
  course_name: string;
  score: number | null;
  total: number;
  completed_at: Date;
}

/** Readiness stats: overall best/last plus a per-subject breakdown. */
export async function getTrainingStats(): Promise<TrainingStats> {
  const studentId = await getStudentId();
  const rows = await query<StatRow>(
    `SELECT q.course_id, c.name AS course_name, q.score, q.total, q.completed_at
     FROM training_quiz q
     JOIN course c ON c.id = q.course_id
     WHERE q.student_id = $1 AND q.completed_at IS NOT NULL AND q.total > 0
     ORDER BY q.completed_at`,
    [studentId],
  );

  const pct = (score: number | null, total: number): number =>
    total > 0 ? Math.round(((score ?? 0) / total) * 100) : 0;

  const bySubject = new Map<string, TrainingSubjectStats>();
  let bestPct: number | null = null;
  let lastPct: number | null = null;
  let lastAt: string | null = null;

  for (const r of rows) {
    const p = pct(r.score, r.total);
    const at = r.completed_at.toISOString();
    bestPct = bestPct == null ? p : Math.max(bestPct, p);
    lastPct = p;
    lastAt = at;

    const key = String(r.course_id);
    const cur = bySubject.get(key);
    if (cur) {
      cur.attempts += 1;
      cur.bestPct = Math.max(cur.bestPct, p);
      cur.lastPct = p;
      cur.lastAt = at;
    } else {
      bySubject.set(key, {
        courseId: Number(r.course_id),
        courseName: r.course_name,
        attempts: 1,
        bestPct: p,
        lastPct: p,
        lastAt: at,
      });
    }
  }

  return {
    attempts: rows.length,
    bestPct,
    lastPct,
    lastAt,
    bySubject: [...bySubject.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
  };
}

-- 0003_training.sql
-- Training ("Treino"): AI-authored and portal-sourced practice quizzes.
--
-- A quiz session is a `training_quiz` row; each generated/sourced question is a
-- `training_question` (with the correct option and rationale); each answer the
-- student gives is a `training_answer`. Scores live on the quiz row so history
-- and readiness stats are cheap to query.

CREATE TABLE training_quiz (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id     bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id      bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  module_id      bigint REFERENCES module(id) ON DELETE SET NULL,
  mode           text NOT NULL, -- 'ai' | 'portal'
  title          text NOT NULL,
  subject_label  text NOT NULL,
  question_count int NOT NULL,
  total          int NOT NULL,
  score          int,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX training_quiz_student_idx ON training_quiz(student_id, created_at DESC);
CREATE INDEX training_quiz_subject_idx ON training_quiz(student_id, course_id, created_at DESC);

CREATE TABLE training_question (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id        bigint NOT NULL REFERENCES training_quiz(id) ON DELETE CASCADE,
  position       int NOT NULL,
  text           text NOT NULL,
  options        jsonb NOT NULL, -- [{ letter, text }]
  answer_index   int NOT NULL,
  explanation    text,
  source_item_id bigint, -- portal content_item when mode = 'portal'
  source_kind    text
);
CREATE INDEX training_question_quiz_idx ON training_question(quiz_id);

CREATE TABLE training_answer (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id      bigint NOT NULL REFERENCES training_quiz(id) ON DELETE CASCADE,
  question_id  bigint NOT NULL REFERENCES training_question(id) ON DELETE CASCADE,
  chosen_index int,
  is_correct   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX training_answer_quiz_idx ON training_answer(quiz_id);

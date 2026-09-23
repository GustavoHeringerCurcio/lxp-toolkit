-- 0015_study_summary.sql
-- Resumo (study summary): one AI-generated markdown summary per subject scope.
--
-- The Resumo aggregates a whole course (or a single module) — extracted PDF /
-- reading material (`content_text`) plus the real quiz bank — and turns it into
-- a medium-size study summary with the most likely exam questions. Generated
-- once and saved so the student can revisit it without regenerating.
--
-- Scope is `(student, course, module)`; `module_id` is NULL for the whole
-- course. Postgres treats NULLs as distinct in a plain UNIQUE constraint, so the
-- scope uniqueness is enforced with an expression index over `COALESCE(module_id, 0)`.

CREATE TABLE IF NOT EXISTS study_summary (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id    bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id     bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  module_id     bigint REFERENCES module(id) ON DELETE SET NULL,
  subject_label text NOT NULL,
  content       text NOT NULL,
  model         text,
  prompt_hash   text,
  item_count    int NOT NULL DEFAULT 0,
  char_count    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS study_summary_scope_idx
  ON study_summary(student_id, course_id, COALESCE(module_id, 0));
CREATE INDEX IF NOT EXISTS study_summary_student_idx
  ON study_summary(student_id, updated_at DESC);

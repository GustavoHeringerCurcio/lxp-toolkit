-- 0016_exam_phases.sql
-- Exam phases ("Provas"): scope study material to the current exam (AVD1, AVD2,
-- Substitutiva) so later exams never re-send material that was already examined.
--
-- The gradebook already groups assessments by category (AVD1/AVD2/...), and the
-- content tree labels some sections by bimester. We import the gradebook
-- structure and let the student set manual exam end-dates; content is then
-- classified by an explicit precedence (see `src/exams.ts`), with manual
-- overrides at item / section / module level.
--
--   course_exam        — per-student exam phases + manual end date
--   module_exam        — whole-subject (module) assignment override
--   section_exam       — section assignment override
--   item_annotation.exam_id — per-item override (NULL = auto)
--   gradebook_category — imported gradebook categories (AVD1, AVD2, ...)
--   gradebook_activity — imported evaluations (id bridges content_item.gradebook_id)
--   study_summary.exam_id   — a saved Resumo per exam scope

CREATE TABLE IF NOT EXISTS course_exam (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id  bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sequence   int NOT NULL,
  ends_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS course_exam_scope_idx
  ON course_exam(student_id, course_id, sequence);
CREATE INDEX IF NOT EXISTS course_exam_course_idx
  ON course_exam(course_id, sequence);

CREATE TABLE IF NOT EXISTS module_exam (
  student_id bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  module_id  bigint NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  exam_id    bigint NOT NULL REFERENCES course_exam(id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'manual',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, module_id)
);

CREATE TABLE IF NOT EXISTS section_exam (
  student_id bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  section_id bigint NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  exam_id    bigint NOT NULL REFERENCES course_exam(id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'manual',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, section_id)
);

ALTER TABLE item_annotation
  ADD COLUMN IF NOT EXISTS exam_id bigint REFERENCES course_exam(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS gradebook_category (
  id         bigint PRIMARY KEY, -- gradebook category id
  course_id  bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sequence   int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gradebook_category_course_idx ON gradebook_category(course_id);

CREATE TABLE IF NOT EXISTS gradebook_activity (
  id            bigint PRIMARY KEY, -- evaluation id (bridges content_item.gradebook_id)
  course_id     bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  category_id   bigint REFERENCES gradebook_category(id) ON DELETE CASCADE,
  name          text NOT NULL,
  deadline_at   timestamptz,
  topic_type_id int,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gradebook_activity_course_idx ON gradebook_activity(course_id);
CREATE INDEX IF NOT EXISTS gradebook_activity_category_idx ON gradebook_activity(category_id);

-- A saved Resumo per (student, course, module, exam). `exam_id` NULL = "Tudo".
ALTER TABLE study_summary
  ADD COLUMN IF NOT EXISTS exam_id bigint REFERENCES course_exam(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS study_summary_scope_idx;
CREATE UNIQUE INDEX IF NOT EXISTS study_summary_scope_idx
  ON study_summary(student_id, course_id, COALESCE(module_id, 0), COALESCE(exam_id, 0));

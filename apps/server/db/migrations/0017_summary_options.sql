-- 0017_summary_options.sql
-- Resumo options: output size + a transparent snapshot of the source items.
--
--   size       — 'small' | 'medium' | 'big' | 'extra', the requested length.
--                One saved Resumo per (scope, size), so switching size keeps
--                the other sizes' summaries.
--   items_json — the compact list of content items the AI actually read, so the
--                UI can show exactly which modules/PDFs/quizzes fed a summary.
--
-- The scope index gains `size`; existing rows default to 'medium'.

ALTER TABLE study_summary
  ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS items_json jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS study_summary_scope_idx;
CREATE UNIQUE INDEX IF NOT EXISTS study_summary_scope_idx
  ON study_summary(student_id, course_id, COALESCE(module_id, 0), COALESCE(exam_id, 0), size);

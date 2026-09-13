-- 0009_template_fill.sql
-- Generic "fill the professor's template/table" detection.
--
-- activity_project now also caches whether the activity asks the student to
-- fill a professor-provided template (table/quadro/modelo) and the field labels
-- the professor wants, extracted from the activity content by the cheap
-- detection model. This is generic: it is not tied to any specific exercise.

ALTER TABLE activity_project ADD COLUMN IF NOT EXISTS wants_template boolean NOT NULL DEFAULT false;
ALTER TABLE activity_project ADD COLUMN IF NOT EXISTS template_fields jsonb NOT NULL DEFAULT '[]';

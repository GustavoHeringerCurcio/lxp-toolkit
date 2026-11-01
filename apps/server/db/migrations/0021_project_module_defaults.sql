-- 0021_project_module_defaults.sql
-- Replace the guessed "course main project" with an explicit, per-activity
-- toggle that injects the student's single external project (project_source).
--
--   activity_project.use_project  TRUE = on, FALSE = off, NULL = inherit the
--                                 module default.
--   module_project_default        per-student default per module/discipline.
--
-- The old course-level project_profile (AI-detected theme/actors/requirements)
-- is removed; it caused the app to invent a project for every course.

ALTER TABLE activity_project ADD COLUMN IF NOT EXISTS use_project boolean;

-- Preserve explicit per-activity choices made through the old card. Auto
-- guesses (source = 'auto') are intentionally discarded (NULL = inherit).
-- Guarded so re-running the migration on a partially-updated database is safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'activity_project' AND column_name = 'source'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'activity_project' AND column_name = 'needs_project'
  ) THEN
    UPDATE activity_project
       SET use_project = needs_project
     WHERE source = 'manual' AND use_project IS NULL;
  END IF;
END $$;

ALTER TABLE activity_project
  DROP COLUMN IF EXISTS needs_project,
  DROP COLUMN IF EXISTS profile_mode,
  DROP COLUMN IF EXISTS theme,
  DROP COLUMN IF EXISTS atores,
  DROP COLUMN IF EXISTS requisitos,
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS intent,
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS source;

CREATE TABLE IF NOT EXISTS module_project_default (
  student_id bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  module_id  bigint NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, module_id)
);

DROP TABLE IF EXISTS project_profile;

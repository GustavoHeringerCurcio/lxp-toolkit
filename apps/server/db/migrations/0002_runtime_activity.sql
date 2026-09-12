-- 0002_runtime_activity.sql
-- Runtime activity is now written directly to Postgres. Add the submission
-- answer text and a natural key so submissions can be upserted by (item, at)
-- (the runner creates a "running" row, then updates it on completion).

ALTER TABLE submission ADD COLUMN IF NOT EXISTS answer text;

CREATE UNIQUE INDEX IF NOT EXISTS submission_natural_key
  ON submission(content_item_id, student_id, at);

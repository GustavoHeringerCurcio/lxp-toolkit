-- 0026_gradebook_completion.sql
-- Store the gradebook's hand-in signal so completion can be reconciled without
-- re-scraping. The portal tree `grade` is the activity max/worth, not the
-- student's grade; `value`/`submited_at`/`is_submitted` are authoritative.

ALTER TABLE gradebook_activity
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS max_value numeric,
  ADD COLUMN IF NOT EXISTS is_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_deadline_expired boolean;

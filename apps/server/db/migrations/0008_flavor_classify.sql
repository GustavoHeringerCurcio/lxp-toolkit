-- 0008_flavor_classify.sql
-- Lazy AI flavor review cache (per student, per content item).
--
-- The deterministic heuristics in `detectAnomalies` decide an upload task's
-- flavor at projection time. When they are inconclusive (`needsReview`), the
-- server asks the cheap model to confirm/correct it once, when the task is
-- opened, and caches the verdict here. A manual `tag` always takes precedence.

ALTER TABLE item_annotation
  ADD COLUMN IF NOT EXISTS auto_flavor        text,
  ADD COLUMN IF NOT EXISTS auto_flavor_reason text,
  ADD COLUMN IF NOT EXISTS auto_flavor_model  text,
  ADD COLUMN IF NOT EXISTS auto_flavor_at     timestamptz;

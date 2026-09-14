-- 0012_debug_log.sql
-- Full-context diagnostics for weak drafts.
--
-- When the quality gate finds a draft not ready to send (completeness <= 90, a
-- failed rubric check, or a non-"ready" verdict), the server writes the entire
-- generation context here (and to a human/agent-readable markdown file) so the
-- "why did this happen" is reproducible after the fact.

CREATE TABLE IF NOT EXISTS debug_log (
  id                bigserial PRIMARY KEY,
  student_id        bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  content_item_id   bigint,
  answer_attempt_id bigint,
  reason            text NOT NULL,
  file_path         text,
  payload           jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debug_log_student_idx ON debug_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS debug_log_item_idx ON debug_log(content_item_id, created_at DESC);

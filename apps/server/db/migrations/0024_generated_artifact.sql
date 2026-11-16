-- Every preview/download/send artifact, saved so a reported bug can be judged
-- later (blank page, broken text, wrong filename, ...). The bytes live under
-- apps/server/data/artifacts; this row is the queryable index.
--
-- Identical bytes for the same activity/mode are deduplicated by sha256 and
-- track `uses` / `last_used_at` instead of creating a row per preview.

CREATE TABLE IF NOT EXISTS generated_artifact (
  id              bigserial PRIMARY KEY,
  student_id      bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  content_item_id bigint REFERENCES content_item(id) ON DELETE SET NULL,
  -- preview | download | send | report
  source          text NOT NULL,
  mode            text NOT NULL,
  filename        text NOT NULL,
  path            text NOT NULL,
  sha256          text NOT NULL,
  bytes           bigint NOT NULL,
  activity_title  text,
  course_name     text,
  module_title    text,
  draft           text,
  gate_json       jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  uses            integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_artifact_identity_idx
  ON generated_artifact(student_id, content_item_id, mode, sha256);

CREATE INDEX IF NOT EXISTS generated_artifact_recent_idx
  ON generated_artifact(student_id, created_at DESC, id DESC);

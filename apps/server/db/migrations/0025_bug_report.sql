-- Beta feedback: a user-written problem report about a generated artifact.
-- The report snapshots the activity, mode, draft, gate verdict and the exact
-- artifact bytes (generated_artifact) so an agent can reproduce and fix it.
-- A human-readable bundle is also written to apps/server/data/reports/<id>.md.

CREATE TABLE IF NOT EXISTS bug_report (
  id               bigserial PRIMARY KEY,
  student_id       bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  content_item_id  bigint REFERENCES content_item(id) ON DELETE SET NULL,
  artifact_id      bigint REFERENCES generated_artifact(id) ON DELETE SET NULL,
  activity_title   text NOT NULL,
  course_name      text,
  module_title     text,
  mode             text NOT NULL,
  message          text NOT NULL,
  draft            text,
  gate_json        jsonb,
  -- Markdown bundle path (readable by a human or an agent).
  file_path        text,
  status           text NOT NULL DEFAULT 'open', -- open | fixed | dismissed
  resolution_notes text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS bug_report_recent_idx
  ON bug_report(student_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS bug_report_artifact_idx
  ON bug_report(artifact_id);

-- 0006_project_context.sql
-- Generic project context for activities.
--
-- Two levels:
--   project_profile  — the student's MAIN project for a course (theme, actors,
--                      functional requirements). Set once, reused by every
--                      activity of that course.
--   activity_project — per-activity relevance (does this activity need a
--                      project?) plus an optional QUICK project that overrides
--                      the main one for that activity.
--
-- Both are AI-detected lazily (cheap model) and cache a content hash so a
-- re-scrape/re-index invalidates them. Public content carries no student_id;
-- these private rows do.

CREATE TABLE project_profile (
  student_id       bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id        bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  theme            text,
  atores           jsonb NOT NULL DEFAULT '[]',
  requisitos       jsonb NOT NULL DEFAULT '[]',
  suggested_themes jsonb NOT NULL DEFAULT '[]',
  source           text NOT NULL DEFAULT 'auto', -- auto | manual
  confidence       real,
  model            text,
  content_hash     text,
  raw_json         jsonb,
  detected_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, course_id)
);

CREATE TABLE activity_project (
  content_item_id bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  student_id      bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  needs_project   boolean NOT NULL DEFAULT false,
  profile_mode    text NOT NULL DEFAULT 'main', -- main | activity | none
  theme           text,                          -- quick project (profile_mode='activity')
  atores          jsonb NOT NULL DEFAULT '[]',
  requisitos      jsonb NOT NULL DEFAULT '[]',
  confidence      real,
  intent          text,
  reason          text,
  source          text NOT NULL DEFAULT 'auto', -- auto | manual
  model           text,
  content_hash    text,
  detected_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_item_id, student_id)
);

CREATE INDEX activity_project_student_idx ON activity_project(student_id);

-- Toggle for automatic project detection (Ajustes → IA).
ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS project_auto_detect boolean NOT NULL DEFAULT true;

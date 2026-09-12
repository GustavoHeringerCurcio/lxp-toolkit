-- 0005_professor_link.sql
-- Per-student professor photo.
--
-- The student pastes a LinkedIn profile URL (resolved to an avatar via unavatar
-- and cached server-side) or, as a fallback, a direct image URL. Keyed by
-- professor so one photo is reused across every module/card they teach.
--
-- Public content (professor) carries no student_id; this private row does.

CREATE TABLE professor_link (
  student_id   bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  professor_id bigint NOT NULL REFERENCES professor(safea_user_id) ON DELETE CASCADE,
  linkedin_url text,
  image_url    text,
  source       text NOT NULL DEFAULT 'linkedin', -- linkedin | manual
  status       text NOT NULL DEFAULT 'pending',  -- pending | ok | failed
  fetched_at   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, professor_id)
);

CREATE INDEX professor_link_professor_idx ON professor_link(professor_id);

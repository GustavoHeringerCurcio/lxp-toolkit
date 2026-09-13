-- 0007_project_source.sql
-- Global per-student "my project" context (Ajustes → Organização).
--
-- A GitHub repo link plus uploaded docs/slides/PDFs used to ground answer
-- drafts that need project context. Unlike `project_profile` (AI-detected, per
-- course), this is a single manual source of truth owned by the student.
--
--   project_source       — one row per student: repo link, notes, fetched README.
--   project_source_file  — uploaded files with extracted text (mirrors content_text).

CREATE TABLE project_source (
  student_id        bigint PRIMARY KEY REFERENCES student(id) ON DELETE CASCADE,
  title             text,
  github_url        text,
  notes             text,
  readme_text       text NOT NULL DEFAULT '',
  readme_status     text NOT NULL DEFAULT 'none', -- ok | empty | error | none
  readme_fetched_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_source_file (
  id           bigserial PRIMARY KEY,
  student_id   bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  filename     text NOT NULL,
  mime         text,
  size_bytes   bigint NOT NULL DEFAULT 0,
  stored_path  text NOT NULL,
  text         text NOT NULL DEFAULT '',
  char_count   int NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'empty', -- ok | empty | unsupported | error
  content_hash text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_source_file_student_idx ON project_source_file(student_id);

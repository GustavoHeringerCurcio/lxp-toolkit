-- 0001_foundation.sql
-- Source-of-truth schema for the Pauta study dataset.
--
-- Domains:
--   1. Identity & tenancy  : institution, student, enrollment
--   2. Academic catalog    : course, module, professor, module_professor, section,
--                            content_item, attachment
--   3. Assessment bank     : question, question_option
--   4. User activity       : item_state, answer_attempt, answer_selection,
--                            submission, submission_payload, item_annotation
--   5. AI/assistant        : ai_config, ai_run
--
-- Public/shared content carries no student_id. Every private row does.

-- ── Domain 1: identity & tenancy ────────────────────────────────────────────

CREATE TABLE institution (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  host       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id bigint REFERENCES institution(id) ON DELETE SET NULL,
  safea_user_id  bigint UNIQUE,
  name           text,
  matricula      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course (
  id             bigint PRIMARY KEY, -- portal courseId
  institution_id bigint REFERENCES institution(id) ON DELETE SET NULL,
  external_id    text, -- e.g. "8793_T01_2026_2"
  name           text NOT NULL,
  term           text,
  start_at       date,
  end_at         date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE enrollment (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id           bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id            bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  portal_enrollment_id bigint,
  first_access_at      timestamptz,
  status               text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

-- ── Domain 2: academic catalog ──────────────────────────────────────────────

CREATE TABLE professor (
  safea_user_id    bigint PRIMARY KEY, -- stable person id from context.teachers[]
  user_id          bigint,
  external_user_id text,
  full_name        text NOT NULL, -- raw portal name (may be padded)
  display_name     text NOT NULL, -- normalized, for UI
  slug             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE module (
  id         bigint PRIMARY KEY, -- portal moduleId
  course_id  bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  title      text NOT NULL,
  name       text,
  sequence   int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX module_course_idx ON module(course_id);

CREATE TABLE module_professor (
  module_id    bigint NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  professor_id bigint NOT NULL REFERENCES professor(safea_user_id) ON DELETE CASCADE,
  source       text NOT NULL DEFAULT 'title_parse', -- title_parse | teachers_fallback | manual
  confidence   real NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, professor_id)
);

CREATE TABLE section (
  id         bigint PRIMARY KEY, -- portal sectionId
  module_id  bigint NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  title      text NOT NULL,
  sequence   int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX section_module_idx ON section(module_id);

CREATE TABLE content_item (
  id                 bigint PRIMARY KEY, -- portal itemId
  course_id          bigint NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  module_id          bigint REFERENCES module(id) ON DELETE SET NULL,
  section_id         bigint REFERENCES section(id) ON DELETE SET NULL,
  enrollment_id      bigint, -- portal enrollment id (write endpoints)
  topic_type_id      int NOT NULL,
  category_type_id   int,
  progress_type_id   int,
  kind               text NOT NULL,
  title              text NOT NULL,
  is_record_progress boolean NOT NULL DEFAULT false,
  sequence           int,
  has_deadline       boolean NOT NULL DEFAULT false,
  deadline_at        timestamptz,
  expired            boolean NOT NULL DEFAULT false,
  html               text,
  content_hash       text,
  raw_json           jsonb, -- normalized item as scraped (projection + provenance)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_item_course_idx ON content_item(course_id);
CREATE INDEX content_item_module_idx ON content_item(module_id);
CREATE INDEX content_item_kind_idx ON content_item(kind);

CREATE TABLE attachment (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_item_id bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  url             text,
  filename        text,
  filesize        bigint,
  local_path      text,
  sha256          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachment_item_idx ON attachment(content_item_id);

-- ── Domain 3: assessment bank ───────────────────────────────────────────────

CREATE TABLE question (
  id               bigint PRIMARY KEY, -- portal questionId
  content_item_id  bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  question_type_id int,
  text             text NOT NULL,
  position         int,
  text_hash        text NOT NULL, -- cross-term dedupe / question bank
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX question_item_idx ON question(content_item_id);
CREATE INDEX question_hash_idx ON question(text_hash);

CREATE TABLE question_option (
  id          bigint PRIMARY KEY, -- portal optionId
  question_id bigint NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  position    int NOT NULL,
  text        text NOT NULL
);
CREATE INDEX question_option_question_idx ON question_option(question_id);

-- ── Domain 4: user activity (append-only history) ───────────────────────────

CREATE TABLE item_state (
  id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_item_id            bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  student_id                 bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  captured_at                timestamptz NOT NULL DEFAULT now(),
  done                       boolean NOT NULL DEFAULT false,
  viewed                     boolean NOT NULL DEFAULT false,
  grade                      text,
  student_grade              text,
  status                     text,
  deadline_at                timestamptz,
  has_completed_all_attempts boolean,
  progress_id                bigint,
  source                     text NOT NULL DEFAULT 'import'
);
CREATE INDEX item_state_item_idx ON item_state(content_item_id, captured_at DESC);
CREATE INDEX item_state_student_idx ON item_state(student_id, captured_at DESC);

CREATE TABLE answer_attempt (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id      bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  content_item_id bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL DEFAULT 'ai', -- ai | manual
  content         text NOT NULL,
  model           text,
  prompt_hash     text,
  is_current      boolean NOT NULL DEFAULT true
);
CREATE INDEX answer_attempt_item_idx ON answer_attempt(content_item_id, created_at DESC);
CREATE UNIQUE INDEX answer_attempt_current_idx
  ON answer_attempt(content_item_id, student_id) WHERE is_current;

CREATE TABLE answer_selection (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  answer_attempt_id bigint NOT NULL REFERENCES answer_attempt(id) ON DELETE CASCADE,
  question_id       bigint REFERENCES question(id) ON DELETE SET NULL,
  option_id         bigint REFERENCES question_option(id) ON DELETE SET NULL,
  letter            text,
  position          int
);
CREATE INDEX answer_selection_attempt_idx ON answer_selection(answer_attempt_id);

CREATE TABLE submission (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id      bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  content_item_id bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  at              timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL,
  mode            text,
  attachment_name text,
  attempt_number  int,
  detail          text,
  portal_detail   text,
  confirmation_at timestamptz
);
CREATE INDEX submission_item_idx ON submission(content_item_id, at DESC);
CREATE INDEX submission_student_idx ON submission(student_id, at DESC);

CREATE TABLE submission_payload (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES submission(id) ON DELETE CASCADE,
  request_json  jsonb,
  response_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item_annotation (
  content_item_id bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  student_id      bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  notes           text,
  prompt_override text,
  hidden          boolean NOT NULL DEFAULT false,
  tag             text,
  manual_status   text,
  ai_request_json jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_item_id, student_id)
);

-- ── Domain 5: AI / assistant ────────────────────────────────────────────────

CREATE TABLE ai_config (
  student_id        bigint PRIMARY KEY REFERENCES student(id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'openai',
  model             text NOT NULL,
  temperature       real,
  max_output_tokens int,
  style_json        jsonb,
  sections_json     jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_run (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id        bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  content_item_id   bigint REFERENCES content_item(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  prompt            text,
  prompt_hash       text,
  completion        text,
  model             text,
  tokens_in         int,
  tokens_out        int,
  latency_ms        int,
  answer_attempt_id bigint REFERENCES answer_attempt(id) ON DELETE SET NULL
);
CREATE INDEX ai_run_student_idx ON ai_run(student_id, created_at DESC);

-- ── Read model: current exercise view (powers /api/exercises projection) ────

CREATE VIEW v_exercise_current AS
SELECT
  ci.id,
  ci.title,
  ci.kind,
  ci.enrollment_id,
  ci.course_id,
  c.name  AS course_name,
  ci.module_id,
  m.title AS module_title,
  m.name  AS module_name,
  ci.section_id,
  s.title AS section_title,
  ci.topic_type_id,
  ci.is_record_progress,
  ci.has_deadline,
  ci.deadline_at,
  ci.html,
  ci.raw_json,
  mp.professor_id,
  p.display_name AS professor_name,
  st.done,
  st.viewed,
  st.grade,
  st.student_grade,
  st.status,
  st.captured_at AS state_captured_at
FROM content_item ci
JOIN course c ON c.id = ci.course_id
LEFT JOIN module m ON m.id = ci.module_id
LEFT JOIN section s ON s.id = ci.section_id
LEFT JOIN LATERAL (
  SELECT professor_id FROM module_professor WHERE module_id = ci.module_id
  ORDER BY confidence DESC LIMIT 1
) mp ON true
LEFT JOIN professor p ON p.safea_user_id = mp.professor_id
LEFT JOIN LATERAL (
  SELECT done, viewed, grade, student_grade, status, captured_at
  FROM item_state WHERE content_item_id = ci.id
  ORDER BY captured_at DESC LIMIT 1
) st ON true;

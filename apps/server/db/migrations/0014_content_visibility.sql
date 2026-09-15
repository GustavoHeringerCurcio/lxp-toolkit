-- 0014_content_visibility.sql
-- God's Eye: hidden/unpublished topics harvested by the portal scraper.
--
-- The portal read endpoint (`/v2/.../topics/{id}`) serves topic content even
-- when the topic is not listed in the student's published content tree. The
-- scraper now harvests those topics and stores them alongside the tree leaves.
--
-- `origin` distinguishes a normal tree leaf ('tree') from a hidden topic
-- ('hidden'); the UI keeps hidden items out of the normal lists and surfaces
-- them in the dedicated God's Eye route. `gradebook_id` links a topic to the
-- course gradebook activity (`context.gradeBookId`); `is_visible`/`is_future`
-- mirror the topic-detail flags for provenance.
ALTER TABLE content_item
  ADD COLUMN IF NOT EXISTS origin       text NOT NULL DEFAULT 'tree',
  ADD COLUMN IF NOT EXISTS gradebook_id bigint,
  ADD COLUMN IF NOT EXISTS is_visible   boolean,
  ADD COLUMN IF NOT EXISTS is_future    boolean;

CREATE INDEX IF NOT EXISTS content_item_origin_idx ON content_item(course_id, origin);

CREATE OR REPLACE VIEW v_exercise_current AS
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
  st.captured_at AS state_captured_at,
  ci.origin,
  ci.gradebook_id,
  ci.is_visible,
  ci.is_future
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

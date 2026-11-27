-- 0027_calendar_and_assessments.sql
-- Calendar events persisted for the app, plus term-aware links between gradebook
-- assessments and content items. The portal reuses gradebook ids across terms,
-- so linking by `gradebook_id` alone can hide a current assessment behind an
-- old topic. `link_status` makes that distinction explicit.

CREATE TABLE IF NOT EXISTS calendar_appointment (
  id               bigint PRIMARY KEY, -- portal appointment id (topic id for topics)
  course_id        bigint REFERENCES course(id) ON DELETE CASCADE,
  title            text NOT NULL,
  start_at         timestamptz,
  end_at           timestamptz,
  is_all_day       boolean NOT NULL DEFAULT false,
  entity_type      text,
  topic_id         bigint,
  academic_main_id bigint,
  category_id      int,
  is_completed     boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_appointment_start_idx
  ON calendar_appointment(start_at);
CREATE INDEX IF NOT EXISTS calendar_appointment_topic_idx
  ON calendar_appointment(topic_id);

ALTER TABLE gradebook_activity
  ADD COLUMN IF NOT EXISTS matched_content_item_id bigint
    REFERENCES content_item(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'gradebook_only';

CREATE INDEX IF NOT EXISTS gradebook_activity_match_idx
  ON gradebook_activity(matched_content_item_id);

CREATE TABLE IF NOT EXISTS deadline_change (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,            -- content_item | gradebook_activity
  ref_id       bigint NOT NULL,
  title        text NOT NULL,
  course_id    bigint,
  old_deadline timestamptz,
  new_deadline timestamptz,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  notified_at  timestamptz,
  UNIQUE (source, ref_id, old_deadline, new_deadline)
);
CREATE INDEX IF NOT EXISTS deadline_change_pending_idx
  ON deadline_change(notified_at, detected_at);

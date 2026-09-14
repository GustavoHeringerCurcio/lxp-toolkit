-- 0011_abilities.sql
-- AI abilities (tools/skills the model can use).
--
--   ai_config.abilities_json — global per-student switches, keyed by ability id.
--   activity_ability         — per-activity override; when a row exists it wins
--                              over the global switch for that item.

ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS abilities_json jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS activity_ability (
  content_item_id bigint NOT NULL REFERENCES content_item(id) ON DELETE CASCADE,
  student_id      bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  ability         text NOT NULL,
  enabled         boolean NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_item_id, student_id, ability)
);

CREATE INDEX IF NOT EXISTS activity_ability_student_idx ON activity_ability(student_id);

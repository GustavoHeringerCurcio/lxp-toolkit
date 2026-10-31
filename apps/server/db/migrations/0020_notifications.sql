-- 0020_notifications.sql
-- Per-student notification channels, event preferences and a dedupe ledger.
--
-- Channels:
--   discord_enabled + discord_webhook_url   -> Discord incoming webhook
--   bark_enabled    + bark_device_key       -> Bark (https://bark.day.app)
--
-- Event switches are global across the enabled channels. `baseline_at` is set
-- when the row is first created so enabling notifications does not replay the
-- student's existing backlog.
--
-- notification_event is the idempotency ledger: a row is claimed atomically
-- before sending, so a refresh and a boot scan cannot double-notify.

CREATE TABLE IF NOT EXISTS notification_config (
  student_id          bigint PRIMARY KEY REFERENCES student(id) ON DELETE CASCADE,
  discord_enabled     boolean NOT NULL DEFAULT false,
  discord_webhook_url text,
  bark_enabled        boolean NOT NULL DEFAULT false,
  bark_device_key     text,
  notify_new          boolean NOT NULL DEFAULT true,
  notify_due_soon     boolean NOT NULL DEFAULT true,
  notify_done         boolean NOT NULL DEFAULT true,
  notify_expired      boolean NOT NULL DEFAULT true,
  baseline_at         timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_event (
  id              bigserial PRIMARY KEY,
  student_id      bigint NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  content_item_id bigint REFERENCES content_item(id) ON DELETE CASCADE,
  -- new | due_soon | done | expired | test
  kind            text NOT NULL,
  -- Stable identity of the occurrence, e.g. "new:123" or "due_soon:123:1760000000000".
  event_key       text NOT NULL,
  -- sent | failed | skipped
  status          text NOT NULL DEFAULT 'sent',
  detail          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, kind, event_key)
);

CREATE INDEX IF NOT EXISTS notification_event_recent_idx
  ON notification_event(student_id, created_at DESC, id DESC);

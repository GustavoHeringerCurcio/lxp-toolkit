-- 0018_refresh_run.sql
-- History of content refreshes (scrape + index pipeline).
--
-- The in-process scheduler and the manual "Atualizar" button both record a row
-- here when a run finishes. Postgres is the source of truth for the daily
-- catch-up decision, so restarting the containers does not re-scrape when the
-- content was already refreshed today.

CREATE TABLE IF NOT EXISTS refresh_run (
  id          bigserial PRIMARY KEY,
  -- manual | scheduled | boot
  source      text NOT NULL DEFAULT 'manual',
  -- ok | failed
  status      text NOT NULL,
  started_at  timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  error       text,
  warning     text
);

CREATE INDEX IF NOT EXISTS refresh_run_finished_idx
  ON refresh_run(finished_at DESC, id DESC);

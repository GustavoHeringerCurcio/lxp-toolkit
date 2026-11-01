-- Official portal course progress, captured from
-- /v1/plataforma/academic/courses/me (the same number the portal shows).
ALTER TABLE enrollment
  ADD COLUMN IF NOT EXISTS progress numeric(5,2),
  ADD COLUMN IF NOT EXISTS progress_updated_at timestamptz;

COMMENT ON COLUMN enrollment.progress IS
  'Official portal course progress (0-100), from academic/courses/me';
COMMENT ON COLUMN enrollment.progress_updated_at IS
  'When progress was last captured from the portal';

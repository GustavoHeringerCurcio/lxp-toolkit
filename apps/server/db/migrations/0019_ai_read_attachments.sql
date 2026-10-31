-- 0019_ai_read_attachments.sql
-- Let the generation model "see" activity attachments (PDFs and images).
--
-- When enabled, the generation call sends PDF pages (text + rendered page
-- images, so diagrams and scanned content are visible) and image attachments
-- instead of only the text extracted from them. Defaults to on; the UI toggle
-- exists so the student can trade vision quality for lower token cost.

ALTER TABLE ai_config
  ADD COLUMN IF NOT EXISTS read_attachments boolean NOT NULL DEFAULT true;

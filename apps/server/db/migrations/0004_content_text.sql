-- 0004_content_text.sql
-- Precomputed material text, extracted once at index time (PDFs via pdf-parse,
-- html/text read directly; Office/zip are unsupported without LibreOffice).
--
-- The Treino knowledge pack reads this instead of extracting on every request,
-- so the AI is grounded in the real course material (readings/PDFs) — the
-- portal only exposes a handful of quizzes, so the material is the corpus.

CREATE TABLE content_text (
  content_item_id bigint PRIMARY KEY REFERENCES content_item(id) ON DELETE CASCADE,
  source_kind     text NOT NULL DEFAULT 'none', -- pdf | office | html | text | unsupported | none
  text            text NOT NULL DEFAULT '',
  char_count      int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'empty', -- ok | empty | unsupported | error
  content_hash    text,
  extracted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_text_status_idx ON content_text(status);

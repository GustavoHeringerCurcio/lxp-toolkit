-- 0010_model_roles_and_gate.sql
-- Per-purpose AI model selection + persisted draft quality gate.
--
--   ai_config.models_json   — role -> model id, so every AI call site (draft
--                             generation, project detection, classification,
--                             diagram, quality gate, training) can use its own
--                             model instead of a hardcoded cheapest default.
--   answer_attempt.gate_json — the cheap-model quality-gate result, stored on
--                             the answer version so it travels with the draft
--                             (history + restore), like the answer itself.

ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS models_json jsonb;
ALTER TABLE answer_attempt ADD COLUMN IF NOT EXISTS gate_json jsonb;

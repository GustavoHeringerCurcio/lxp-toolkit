-- 0022_clear_legacy_gate.sql
-- Answer Confidence is now a 4-level judgment (terrible | bad | ok | good)
-- with a single reason, replacing the old scores/checks payload.
--
-- Clear every saved analysis and old gate diagnostic so no legacy shape can be
-- rendered or mixed with the new one. The column itself stays; new results are
-- written to it as before.

UPDATE answer_attempt SET gate_json = NULL WHERE gate_json IS NOT NULL;
DELETE FROM debug_log;

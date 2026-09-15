-- 0013_remove_gradebook_only_items.sql
-- The gradebook reconciliation (removed from the scraper) created synthetic
-- "gradebook-only" items for activities the portal listed under "Notas" before
-- publishing them in the content tree. Those rows used negative ids and grouped
-- under synthetic modules named after gradebook categories (AVD1, Atividades
-- Formativas 1, …), which the UI then showed as if they were real modules.
--
-- Real portal ids are always positive, so negative ids identify exactly those
-- synthetic rows. Cascades clean up dependent item_state/answer_attempt/etc. and
-- module_professor rows.
DELETE FROM content_item WHERE id < 0;
DELETE FROM module      WHERE id < 0;

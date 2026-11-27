-- 0028_exam_windows.sql
-- Exams are date windows, not just end dates. AVD2 starts when AVD1 ends, so
-- Resumo/Treino must not include AVD1 material. The end date is inclusive
-- end-of-day in São Paulo (the UI edits a calendar date, not a UTC instant).
--
-- include_neutral controls general material with no exam signal:
--   true  -> include it in this exam (default: first exam)
--   false -> only items explicitly assigned to this exam (default: later exams)

ALTER TABLE course_exam
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS include_neutral boolean NOT NULL DEFAULT true;

-- Existing end dates were saved as UTC midnight from a date input; treat them
-- as the end of that calendar day in the student's timezone.
UPDATE course_exam
   SET ends_at = (
         (ends_at AT TIME ZONE 'UTC')::date + time '23:59:59'
       ) AT TIME ZONE 'America/Sao_Paulo'
 WHERE ends_at IS NOT NULL
   AND (ends_at AT TIME ZONE 'UTC')::time = time '00:00:00';

-- Each exam starts when the previous one ends (exclusive boundary).
WITH ordered AS (
  SELECT id,
         lag(ends_at) OVER (PARTITION BY student_id, course_id ORDER BY sequence, id) AS prev_end
    FROM course_exam
)
UPDATE course_exam e
   SET starts_at = o.prev_end
  FROM ordered o
 WHERE e.id = o.id
   AND e.starts_at IS NULL;

-- Only the first exam includes general/neutral material by default.
UPDATE course_exam SET include_neutral = (sequence = 1);

-- Old Resumos were built with the cumulative scope; mark them stale so the UI
-- regenerates instead of showing AVD1 material under AVD2.
ALTER TABLE study_summary
  ADD COLUMN IF NOT EXISTS scope_version int NOT NULL DEFAULT 0;

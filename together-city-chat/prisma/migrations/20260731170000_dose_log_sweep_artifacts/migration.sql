-- Delete the DoseLog rows the hourly sweep wrote before anyone could answer it.
--
-- WHY THESE ROWS ARE NOT EVIDENCE OF ANYTHING.
--
-- A job runs every hour and writes `action: 'missed'` against any dose two
-- hours past its time with no log on it. Until 62e1fe3 ("there was no way to
-- say you had taken one", 2026-07-30) there was no path in the app to record
-- `taken` or `skipped` — the endpoint existed, the model existed, and the
-- client hook sat unimported. So every dose anybody was prescribed became a
-- missed dose in their medical record, however faithfully they were taking it.
--
-- That means a `missed` from that period carries no information: a dose taken
-- on time and a dose genuinely forgotten produced the identical row. Keeping
-- them means the app goes on asserting something it cannot know, in a medical
-- record, about medication adherence. Deleting them loses the genuinely-missed
-- doses too, and that is the smaller loss — they were never distinguishable.
--
-- THE PREDICATE IS DELIBERATELY NARROW. All three conditions matter:
--
--   action = 'missed'      -- a citizen's own taken/skipped is untouched
--   actedAtUtc IS NULL     -- only the sweep leaves this null; recordDose always
--                          -- stamps it, which is also how today() counts what
--                          -- was "answered by the citizen"
--   createdAt < <cutoff>   -- after the cutoff a `missed` means something, because
--                          -- by then there was a button to press instead
--
-- THE CUTOFF is the commit that shipped the today view: 2026-07-30 13:23:12 UTC
-- (62e1fe3, 2026-07-30 18:53:12 +0530). The deploy landed minutes after the
-- commit, so at most one hourly sweep's worth of rows sits between the two and
-- survives this. That residue is bounded and known, and under-deleting is the
-- right way to be wrong here: it leaves a few rows too many rather than removing
-- a record somebody might have meant.
--
-- This runs once, via `prisma migrate deploy` on container start.

DELETE FROM "DoseLog"
WHERE action = 'missed'
  AND "actedAtUtc" IS NULL
  AND "createdAt" < TIMESTAMP WITH TIME ZONE '2026-07-30 13:23:12+00';

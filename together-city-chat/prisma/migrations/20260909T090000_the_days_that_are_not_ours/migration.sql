-- ── THE DAYS THAT ARE NOT OURS (owner, 9 Sep) ───────────────────────────────
-- "Let the user decide which two days they want a break — or if they don't
--  want a break, what they can do: maybe just a walk or a run or a swim."
--
-- Two nullable columns, no default and no backfill. NULL is the honest value
-- for every citizen who has not been asked: the programme falls back to the
-- calendar's own placement, which is exactly the month they already had, so
-- this migration changes nobody's plan until they answer.
ALTER TABLE "FitnessProfile" ADD COLUMN "restDays" TEXT;
ALTER TABLE "FitnessProfile" ADD COLUMN "restActivity" TEXT;

-- A SESSION OF ONE'S OWN.
--
-- Five nullable/defaulted columns on FitnessProfile, and every line additive:
-- nothing existing is altered, nothing is backfilled, so a rollback leaves
-- every row exactly as it was.
--
-- NULL AND '' ARE NOT "NOTHING" ANYWHERE HERE. They mean the question has not
-- been asked, which is a different fact from the answer being none — 'none' is
-- how a citizen says they train with no equipment. The session engine reports
-- an unasked question in `why.missing` rather than assuming an answer.
ALTER TABLE "FitnessProfile" ADD COLUMN "equipment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FitnessProfile" ADD COLUMN "daysPerWeek" INTEGER;
ALTER TABLE "FitnessProfile" ADD COLUMN "limitations" TEXT;
ALTER TABLE "FitnessProfile" ADD COLUMN "place" TEXT;
ALTER TABLE "FitnessProfile" ADD COLUMN "sessionMinutes" INTEGER;

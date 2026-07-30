-- Sex at birth and gender identity become separate questions (review p2).
--
-- One `gender` column has been answering two of them, and the code already knew
-- it could not. propagationPlan carried this line:
--
--     const sexBinary = gender === 'male' || gender === 'female' ? gender : undefined
--
-- so a non-binary citizen's answer was dropped on the way to the nutrition and
-- fitness engines — Mifflin-St Jeor has a coefficient for male and one for
-- female and nothing else. They got no clinical personalisation and were never
-- told why.
--
-- Splitting the field is what lets a non-binary or trans citizen have accurate
-- targets AND be addressed correctly. sexAtBirth is clinical and private;
-- genderIdentity is social and shown.

ALTER TABLE "MasterProfile" ADD COLUMN "sexAtBirth" TEXT;
ALTER TABLE "MasterProfile" ADD COLUMN "genderIdentity" TEXT;
ALTER TABLE "MasterProfile" ADD COLUMN "genderIdentityOther" TEXT;

-- Backfill, and the asymmetry is the careful part.
--
-- Whatever the citizen put in `gender` was their answer to "who are you", so it
-- copies to genderIdentity in full, including nonbinary and other.
UPDATE "MasterProfile"
SET "genderIdentity" = CASE "gender"
    WHEN 'nonbinary' THEN 'nonBinary'
    ELSE "gender"
  END
WHERE "gender" IS NOT NULL;

-- It does NOT copy to sexAtBirth unless it is male or female. Writing
-- 'nonbinary' into a clinical field would be inventing a medical fact from a
-- social one, and 'other' says even less. Those accounts keep sexAtBirth NULL,
-- which is honest: computeTargets then reports `sex` in its `assumed` list and
-- the screen can ask rather than guess.
--
-- Nobody is worse off than before — the old code discarded exactly these values
-- too. The difference is that they can now answer the clinical question
-- separately and get real numbers.
UPDATE "MasterProfile"
SET "sexAtBirth" = "gender"
WHERE "gender" IN ('male', 'female');

-- `gender` is deliberately left in place. Reading it is still the fallback for
-- any row this backfill did not reach, and dropping a column in the same release
-- that stops writing it leaves no way back if the split needs revisiting.

-- A new account must show nothing until the citizen fills something in (p1).
--
-- Registration creates a FoodPref, a BeautyProfile and a FitnessProfile up
-- front, and every one of those tables carries column defaults that read as
-- answers: diet "everything", goal "maintain", skin "normal", hair "straight",
-- level "beginner", and — worst of all — FitnessProfile.age 35 and sex "other".
--
-- The profile summary then reported them as the citizen's own, which is exactly
-- what the review photographed: "Diet: everything · Goal: maintain",
-- "Skin: normal · Hair: straight", "beginner · goal: general", on an account
-- that had answered no questions at all.
--
-- The row is not the problem — other code expects it to exist. What was missing
-- is any way to tell "we have a row" from "they told us something". That is now
-- an explicit column rather than an inference from the values, because
-- "everything" and "maintain" are perfectly good real answers and no amount of
-- comparing against defaults can distinguish a chosen one from a supplied one.

ALTER TABLE "FoodPref"        ADD COLUMN "answeredAt" TIMESTAMP(3);
ALTER TABLE "BeautyProfile"   ADD COLUMN "answeredAt" TIMESTAMP(3);
ALTER TABLE "FitnessProfile"  ADD COLUMN "answeredAt" TIMESTAMP(3);

-- Backfill for accounts that predate the column.
--
-- The test is "does this row hold anything the defaults would not have put
-- there". A row that only ever received defaults keeps answeredAt NULL and
-- correctly reads as unanswered.
--
-- Deliberately conservative, and the trade is worth stating: somebody who
-- genuinely chose "everything" and "maintain" and filled in nothing else will
-- be treated as not having answered. They will be asked once more. The other
-- direction — inventing an answer on their behalf — is the bug being fixed, and
-- asking twice is a smaller harm than asserting something they never said.
UPDATE "FoodPref" SET "answeredAt" = "updatedAt"
WHERE "diet" <> 'everything' OR "goal" <> 'maintain'
   OR "heightCm" IS NOT NULL OR "weightKg" IS NOT NULL
   OR "age" IS NOT NULL OR "sex" IS NOT NULL OR "extras" IS NOT NULL;

UPDATE "BeautyProfile" SET "answeredAt" = "updatedAt"
WHERE "skinType" <> 'normal' OR "hairType" <> 'straight'
   OR "concerns" <> '' OR "extras" IS NOT NULL;

UPDATE "FitnessProfile" SET "answeredAt" = "updatedAt"
WHERE "age" <> 35 OR "sex" <> 'other' OR "level" <> 'beginner'
   OR "goal" <> 'general' OR "mode" <> 'mixed' OR "bodyGoal" <> 'athletic'
   OR "conditions" <> '' OR "heightCm" IS NOT NULL OR "weightKg" IS NOT NULL;

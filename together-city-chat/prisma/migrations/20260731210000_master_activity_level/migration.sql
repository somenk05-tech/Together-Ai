-- The citizen's activity level, as a name rather than a multiplier.
--
-- Unbackfilled on purpose, and this one matters more than usual:
-- FoodPref.activity has a column DEFAULT of 1.4, so a SQL backfill would file
-- "lightly active" for every citizen who has never answered the question.
-- MasterProfileService.get() consolidates it only when FoodPref.answeredAt is
-- set — the guard that already exists for exactly this reason.
ALTER TABLE "MasterProfile" ADD COLUMN "activityLevel" TEXT;

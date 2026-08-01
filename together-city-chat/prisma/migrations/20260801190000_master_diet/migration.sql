-- What the citizen eats, as the key the meal engine branches on.
--
-- Unbackfilled on purpose, for the same reason as activityLevel and with a
-- sharper edge: FoodPref.diet is NOT NULL with a column DEFAULT of
-- 'everything', written at registration before anybody was asked anything. A
-- SQL backfill would therefore file "eats everything" for every citizen who has
-- never opened Nutrition — and a diet is not a preference, it is a rule about
-- what may be put in front of somebody. MasterProfileService.get() consolidates
-- it only when FoodPref.answeredAt is set.
ALTER TABLE "MasterProfile" ADD COLUMN "dietaryPreference" TEXT;

-- The daily targets that were actually in force on one calendar day.
--
-- Without this, yesterday's intake is scored against today's target: the plan
-- is regenerated, the profile changes, and the equation itself was corrected
-- this week (the deficit cap and the per-sex floor both moved every number).
-- History then shows progress or failure that never happened.
--
-- No backfill. We do not know what target was in force last Tuesday, and
-- inventing one would be the exact failure this table exists to prevent.
-- History starts empty and starts true.
CREATE TABLE "DailyTargetSnapshot" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "day"          TEXT NOT NULL,
  "timezone"     TEXT NOT NULL,
  "kcal"         INTEGER NOT NULL,
  "protein"      INTEGER NOT NULL,
  "carb"         INTEGER NOT NULL,
  "fat"          INTEGER NOT NULL,
  "fiber"        INTEGER NOT NULL,
  "payload"      TEXT NOT NULL,
  "personalised" BOOLEAN NOT NULL DEFAULT true,
  "computedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTargetSnapshot_pkey" PRIMARY KEY ("id")
);

-- One row per citizen per day. The uniqueness is what makes "today's target"
-- a single fact rather than a history of guesses within one day.
CREATE UNIQUE INDEX "DailyTargetSnapshot_userId_day_key" ON "DailyTargetSnapshot"("userId", "day");
CREATE INDEX "DailyTargetSnapshot_userId_day_idx" ON "DailyTargetSnapshot"("userId", "day");

ALTER TABLE "DailyTargetSnapshot" ADD CONSTRAINT "DailyTargetSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

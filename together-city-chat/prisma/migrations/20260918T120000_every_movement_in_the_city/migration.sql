-- ── EVERY MOVEMENT IN THE CITY (owner, 18 Sep) ──────────────────────────────
-- "The user can add the workouts to create his own plan for the day or week
--  and save those plans on the page."
--
-- One new table: a citizen's own workout plan, built from the library. No
-- foreign key to User, like MemberOrigin — the purge plan takes it by userId.

CREATE TABLE "WorkoutPlan" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "days"      JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkoutPlan_userId_updatedAt_idx" ON "WorkoutPlan"("userId", "updatedAt");

-- ── A DAY IS A PAGE, AND THE CITIZEN CAN ADD TO IT (owner, 18 Sep) ──────────
-- "Below each workout day page add search and add workout to the day."
-- One new table: a movement the citizen put on a day of their own month.
-- No foreign key to User, like WorkoutPlan — the purge plan takes it by userId.

CREATE TABLE "ProgrammeAddition" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "cycle"      INTEGER NOT NULL,
  "dayIndex"   INTEGER NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "sets"       INTEGER NOT NULL,
  "reps"       INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeAddition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProgrammeAddition_userId_cycle_dayIndex_idx" ON "ProgrammeAddition"("userId", "cycle", "dayIndex");

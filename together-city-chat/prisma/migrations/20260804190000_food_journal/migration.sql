-- The AI Food Journal: what a citizen actually ate, one meal per row.
--
-- itemsJson holds the per-item AI ESTIMATES the citizen reviewed before
-- logging; totalsJson is summed server-side at write time so a client can
-- never post totals that disagree with the items underneath them. Estimates
-- stay labelled as estimates on every surface that renders them — the same
-- honesty rule the blood-report extraction follows: AI reads, it never
-- diagnoses, and here it estimates, it never measures.
--
-- Purged with the account (see purge-plan.ts): what somebody ate is theirs
-- alone, exactly like their food preferences.

CREATE TABLE "FoodJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "mealType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "totalsJson" TEXT NOT NULL,
    "photoUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FoodJournalEntry_userId_at_idx" ON "FoodJournalEntry"("userId", "at");

ALTER TABLE "FoodJournalEntry" ADD CONSTRAINT "FoodJournalEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

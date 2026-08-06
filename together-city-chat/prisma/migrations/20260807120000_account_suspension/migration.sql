-- Suspension, as its own pair of columns.
--
-- Not a reuse of deletedAt. A suspension and a citizen closing their own
-- account are different events with different consequences: the purge plan
-- destroys a deleted account's data after thirty days, and a suspended account
-- must keep everything, because a suspension is a decision somebody may reverse
-- and because the evidence for it is the data. Sharing one column would have
-- put a moderation action on a thirty-day timer nobody chose.
--
-- Nullable, no default, no backfill: every existing account is not suspended,
-- which is what NULL already says.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT;

-- The console lists suspended accounts, and does it on a table that will be
-- overwhelmingly NULL. A partial index keeps that list cheap without carrying
-- an entry for every citizen who was never suspended.
CREATE INDEX IF NOT EXISTS "User_suspendedAt_idx" ON "User" ("suspendedAt") WHERE "suspendedAt" IS NOT NULL;

-- Records that a deleted account's data has actually been destroyed.
--
-- Additive: one nullable column. Existing rows read NULL, which is correct —
-- nothing has been purged yet, and every already-deleted account becomes due
-- the moment it passes the 30-day window.
--
-- The column is what makes the job idempotent. Without it the sweep would
-- re-run every night against accounts it had already emptied, which is
-- harmless but hides whether it ever ran, and leaves no way to answer "when
-- was this person's data actually removed" — which is the question a data
-- deletion request is really asking.
ALTER TABLE "User" ADD COLUMN "purgedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_purgedAt_idx" ON "User"("deletedAt", "purgedAt");

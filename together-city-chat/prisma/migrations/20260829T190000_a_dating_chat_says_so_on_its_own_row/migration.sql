-- A DATING CHAT SAYS SO ON ITS OWN ROW.
--
-- `Conversation.kind` replaces a lookup through `DatingMatch` that swallowed
-- its own errors and answered "not a dating chat" when it could not tell.
--
-- The backfill is the whole point of the column arriving safely: every
-- conversation a live or ended match points at becomes 'dating' in the same
-- statement that adds the column, so there is no window in which an existing
-- anonymous thread reads as a city one. `DatingMatch` rows that carry a
-- conversation are never deleted (see purge-plan.ts), so this set is complete.
ALTER TABLE "Conversation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'city';

UPDATE "Conversation" SET "kind" = 'dating'
WHERE "id" IN (SELECT "conversationId" FROM "DatingMatch" WHERE "conversationId" IS NOT NULL);

CREATE INDEX "Conversation_kind_idx" ON "Conversation"("kind");

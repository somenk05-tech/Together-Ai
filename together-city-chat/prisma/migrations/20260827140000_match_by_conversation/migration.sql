-- Find a dating match by its conversation, cheaply.
--
-- The message permission gate now asks "is the match behind this conversation
-- still live" on every send into a dating chat, because unmatching used to
-- archive the thread and nothing more — and archiving is a per-member flag the
-- member can undo in one tap. Without this index that question is a sequential
-- scan of DatingMatch on the hot path.
CREATE INDEX IF NOT EXISTS "DatingMatch_conversationId_idx" ON "DatingMatch"("conversationId");

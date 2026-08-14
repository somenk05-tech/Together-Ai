-- A reaction is addressed to the ROOM, which is what separates this column
-- from starredForJson beside it: a star is the reader's own bookkeeping that
-- nobody else can see. Stored as JSON { "<emoji>": userId[] }, one key per
-- emoji, and a userId under at most one key — one reaction per person.
ALTER TABLE "Message" ADD COLUMN "reactionsJson" TEXT;

-- One pinned message per conversation. Nullable rather than defaulted, so
-- nothing has to be rewritten for the rows that predate this: absent and
-- unpinned are the same fact.
ALTER TABLE "Message" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "pinnedById" TEXT;

-- "What is pinned in this room" is a one-row question asked on every thread
-- open. Without this it is a scan of the conversation's whole history.
CREATE INDEX "Message_conversationId_pinnedAt_idx" ON "Message"("conversationId", "pinnedAt");

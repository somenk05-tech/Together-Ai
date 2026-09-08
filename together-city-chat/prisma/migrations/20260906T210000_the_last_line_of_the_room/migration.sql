-- THE LAST LINE OF THE ROOM, KEPT ON THE ROOM (1M-DAU pass, 6 Sep).
--
-- `summariesFor` needed one message per conversation — the newest undeleted one
-- — and asked for it with findMany + orderBy createdAt desc + distinct on
-- conversationId. Postgres rejects `SELECT DISTINCT ON (x) … ORDER BY y` unless
-- the ORDER BY leads with the DISTINCT ON columns, so Prisma could not push it
-- down and pulled every undeleted message in every one of those rooms into the
-- API process to de-duplicate in JavaScript. A citizen in forty rooms averaging
-- two thousand messages was eighty thousand rows, on the endpoint every open
-- client polls four times a minute.
--
-- The columns are written where the message is sent — on the `conversation.update`
-- that was already touching `updatedAt` for ordering — and recomputed when the
-- message they name is deleted for everyone.
--
-- THE BACKFILL IS A REAL DISTINCT ON, which is the query Prisma would not
-- write: it walks @@index([conversationId, createdAt]) and stops at the first
-- row of each group, so it is one pass rather than a scan per room. On a large
-- Message table run it by hand and mark this applied:
--   npx prisma migrate resolve --applied 20260906T210000_the_last_line_of_the_room

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastMessageAt"       TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastMessageText"     TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastMessageSenderId" TEXT;

UPDATE "Conversation" c
   SET "lastMessageAt"       = m."createdAt",
       "lastMessageText"     = m."text",
       "lastMessageSenderId" = m."senderId"
  FROM (
    SELECT DISTINCT ON ("conversationId")
           "conversationId", "createdAt", "text", "senderId"
      FROM "Message"
     WHERE "deleted" = false
     ORDER BY "conversationId", "createdAt" DESC
  ) m
 WHERE m."conversationId" = c.id;

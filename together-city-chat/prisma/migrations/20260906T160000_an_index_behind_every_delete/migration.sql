-- AN INDEX BEHIND EVERY DELETE, AND ONE ON THE DOOR (launch audit, 6 Sep).
--
-- Five indexes. Four of them exist because a column is READ by something
-- nobody wrote a query for: a cascade, a SetNull, a sign-in. The fifth is the
-- recovery path. Every one of them was a sequential scan of its whole table.
--
--   Bookmark(postId)          post.delete cascades to Bookmark. Both existing
--                             indexes lead with userId, so the cascade could
--                             only scan. Deleting an account with 200 posts ran
--                             200 full scans of Bookmark inside one request.
--   Comment(authorId)         a Cascade foreign key with nothing behind it, and
--                             the profile page counts comments by author.
--   Message(replyToMessageId) `replyTo` is optional with no onDelete, so the
--                             default is SetNull: deleting ONE message updates
--                             every row pointing at it, found by scanning the
--                             largest table in the city. Reached by cascade
--                             from both Conversation and User.
--   User(email), User(phone)  sign-in, registration and recovery all read these
--                             columns directly. The only email index is the
--                             partial UNIQUE on LOWER("email") from
--                             20260730120000, which Postgres cannot use for
--                             `WHERE "email" = $1` and which excludes the
--                             unverified rows /auth/forgot deliberately wants.
--                             `phone` had no index of any kind — `phoneE164`
--                             is a different column.
--
-- CONCURRENTLY IS DELIBERATELY NOT USED HERE, for the reason given in
-- 20260830T090000: `prisma migrate deploy` wraps each migration in a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run inside one.
--
-- ON A LARGE DATABASE, DO NOT RUN THIS THROUGH `migrate deploy`. A plain
-- CREATE INDEX takes a SHARE lock and blocks every write to the table for the
-- length of the build — on Message and User that is the whole city. Instead,
-- against the production database, by hand:
--
--   CREATE INDEX CONCURRENTLY "Bookmark_postId_idx"          ON "Bookmark"("postId");
--   CREATE INDEX CONCURRENTLY "Comment_authorId_idx"         ON "Comment"("authorId");
--   CREATE INDEX CONCURRENTLY "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");
--   CREATE INDEX CONCURRENTLY "User_email_idx"               ON "User"("email");
--   CREATE INDEX CONCURRENTLY "User_phone_idx"               ON "User"("phone");
--
-- then `npx prisma migrate resolve --applied 20260906T160000_an_index_behind_every_delete`.
-- The IF NOT EXISTS below makes that safe either way: a hand-built index is
-- found, not rebuilt.

CREATE INDEX IF NOT EXISTS "Bookmark_postId_idx" ON "Bookmark"("postId");
CREATE INDEX IF NOT EXISTS "Comment_authorId_idx" ON "Comment"("authorId");
CREATE INDEX IF NOT EXISTS "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_phone_idx" ON "User"("phone");

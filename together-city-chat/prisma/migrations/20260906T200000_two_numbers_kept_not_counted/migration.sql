-- TWO NUMBERS KEPT, NOT COUNTED (1M-DAU pass, 6 Sep).
--
-- Every heart tap ran `like.count({ where: { postId } })` — an index-only scan
-- of every like on that post, and the taps arrive fastest exactly when the
-- count is largest. Every feed page asked Prisma for `_count` on two relations
-- per row, and twice per row once a repost unwraps: up to 84 correlated
-- aggregate subqueries to render twenty-one cards.
--
-- The counters are written at the moment the like or the comment lands, by
-- Postgres, under the row's own lock — so a concurrent tap cannot lose an
-- increment the way a read-modify-write would.
--
-- THE BACKFILL IS THE POINT OF THIS FILE. A default of 0 on a table with posts
-- in it means every existing post reads as having no likes, which is worse than
-- the slow query it replaces. Both UPDATEs below are one pass over Like and
-- Comment grouped by post — seconds on today's data, minutes on a large one,
-- and they must finish before the code that reads the columns is serving.
--
-- ON A LARGE DATABASE, run the two UPDATEs by hand outside the migration (they
-- take a row lock per post for the length of the statement) and then mark this
-- applied:
--   npx prisma migrate resolve --applied 20260906T200000_two_numbers_kept_not_counted
-- The ADD COLUMNs are instant — a non-volatile default has not rewritten the
-- table since Postgres 11.

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "likeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Post" p
   SET "likeCount" = c.n
  FROM (SELECT "postId", COUNT(*)::int AS n FROM "Like" GROUP BY "postId") c
 WHERE c."postId" = p.id AND p."likeCount" <> c.n;

UPDATE "Post" p
   SET "commentCount" = c.n
  FROM (SELECT "postId", COUNT(*)::int AS n FROM "Comment" GROUP BY "postId") c
 WHERE c."postId" = p.id AND p."commentCount" <> c.n;

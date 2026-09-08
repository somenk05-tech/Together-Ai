-- THE NEWEST POST IS THE FIRST POST (owner, 8 Sep).
--
-- The profile grid orders by `sortIndex asc nulls last, createdAt desc`. An
-- author who has pressed Rearrange has an arranged block at 0,1,2… and every
-- post made SINCE has a null sortIndex, which sorts below the whole block —
-- so their newest work sat at the bottom of the wall.
--
-- createPost now gives a new post the top slot explicitly. This repairs the
-- posts already written: for each author who has an arrangement, every
-- un-arranged post created AFTER the newest post in that arrangement is lifted
-- above it, newest first.
--
-- IT MOVES NOTHING ELSE. An un-arranged post OLDER than the arrangement is
-- exactly what the author left at the bottom when they arranged, so it stays
-- there; an author who never arranged has no index at all and is untouched,
-- since all-null already falls through to `createdAt desc`. Reposts are not on
-- the grid (every read filters `repostOfId IS NULL`) and are skipped.
WITH arrangement AS (
  SELECT "authorId",
         MAX("createdAt") AS arranged_through,
         MIN("sortIndex") AS top_index
    FROM "Post"
   WHERE "sortIndex" IS NOT NULL
   GROUP BY "authorId"
),
since AS (
  SELECT p.id,
         a.top_index - ROW_NUMBER() OVER (
           PARTITION BY p."authorId" ORDER BY p."createdAt" ASC, p.id ASC
         ) AS new_index
    FROM "Post" p
    JOIN arrangement a ON a."authorId" = p."authorId"
   WHERE p."sortIndex" IS NULL
     AND p."repostOfId" IS NULL
     AND p."createdAt" > a.arranged_through
)
UPDATE "Post"
   SET "sortIndex" = since.new_index
  FROM since
 WHERE "Post".id = since.id;

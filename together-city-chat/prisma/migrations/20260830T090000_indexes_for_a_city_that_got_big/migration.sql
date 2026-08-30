-- INDEXES FOR A CITY THAT GOT BIG.
--
-- Three, each tied to a query that is now on the hot path because the fan-out
-- and the feed were bounded in the same change.
--
--   Follow(followeeId, createdAt DESC)
--     `postRecipients` no longer loads every follower; it takes the newest
--     SOCIAL_FANOUT_MAX of them. `Follow_followeeId_idx` finds the rows but
--     leaves the planner to sort them — which for an account with half a
--     million followers is sorting half a million rows to return a thousand,
--     i.e. exactly the cost the cap was added to avoid. With createdAt in the
--     index it is a backwards index scan that stops at the LIMIT.
--
--   Post(authorId, moderation, createdAt DESC, id DESC)
--     The BOUNDED lenses — Friends, Following — are
--     `authorId IN (...) AND moderation = 'visible' ORDER BY createdAt DESC,
--     id DESC LIMIT 21`. The city-wide pair added on 30 Aug does not help
--     here, because those reads lead with authorId. This lets the planner run
--     one ordered scan per author and merge-append them, so a citizen with a
--     thousand connections reads twenty-one rows rather than materialising and
--     sorting every post any of them ever wrote.
--
--     `Post_authorId_createdAt_idx` is now redundant with this one (a btree on
--     (a, b, c, d) serves any leading prefix, and (authorId, createdAt) is not
--     a prefix of this — but (authorId) is, and the profile grid also filters
--     moderation). It is dropped: two indexes on the same leading column are
--     two indexes to write on every insert, and inserts are the thing a
--     million citizens do.
--
--   Like(postId)
--     `like.count({ where: { postId } })` runs on every heart tap. It has been
--     riding the (postId, userId) unique index, which does serve it — this is
--     NOT added, and the line is here so the next person does not add it
--     believing it is missing.
--
-- CONCURRENTLY is deliberately not used, for the reason given in the 30 Aug
-- migration: `prisma migrate deploy` wraps each migration in a transaction.
-- BEFORE RUNNING THIS ON A LARGE TABLE, build the two indexes by hand with
-- CREATE INDEX CONCURRENTLY, drop the old one, and mark the migration applied
-- with `prisma migrate resolve --applied`. On today's data it is milliseconds.

CREATE INDEX "Follow_followeeId_createdAt_idx" ON "Follow"("followeeId", "createdAt" DESC);

CREATE INDEX "Post_authorId_moderation_createdAt_id_idx" ON "Post"("authorId", "moderation", "createdAt" DESC, "id" DESC);

DROP INDEX IF EXISTS "Post_authorId_createdAt_idx";

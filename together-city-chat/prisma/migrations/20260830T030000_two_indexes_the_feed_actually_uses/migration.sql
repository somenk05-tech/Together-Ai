-- TWO INDEXES THE FEED ACTUALLY USES.
--
-- `Post_authorId_createdAt_idx` carries a comment claiming it "serves the hot
-- feed path: WHERE authorId IN (...) ORDER BY createdAt DESC". It does not. A
-- btree on (authorId, createdAt) walks in createdAt order for ONE author; for
-- an IN-list the planner appends N index scans and sorts the union, so a
-- citizen with 300 connections had several thousand rows materialised and
-- sorted to return twenty. It is kept — it genuinely serves the profile grid,
-- which reads a single author — and this pair is added beside it.
--
--   Post(moderation, createdAt, id)  — every feed lens filters moderation and
--   orders (createdAt DESC, id DESC). With the sort key in the index the
--   city-wide read is a backwards index scan with a LIMIT rather than a scan
--   plus a sort of everything that matched.
--
--   PostMedia(postId, kind)  — the Photos and Videos lenses are
--   `media: { some: { kind } }`, an EXISTS probe per candidate post. Without
--   kind in the index, finding 21 videos among a city's photographs meant
--   hundreds of rows scanned and probed per page.
--
-- CONCURRENTLY is deliberately NOT used: `prisma migrate deploy` runs each
-- migration inside a transaction and CREATE INDEX CONCURRENTLY cannot run in
-- one. These tables are small enough today that the lock is measured in
-- milliseconds; when they are not, build the index by hand out of band and
-- mark the migration applied.
CREATE INDEX "Post_moderation_createdAt_id_idx" ON "Post"("moderation", "createdAt", "id");

CREATE INDEX "PostMedia_postId_kind_idx" ON "PostMedia"("postId", "kind");

-- A WORKER OF ITS OWN (1M-DAU pass, 6 Sep).
--
-- The encode moved off the container that serves citizens, onto the `media`
-- lane and a JOBS_ROLE=worker service. One consequence: nothing on the API box
-- quietly finishes a video the queue dropped any more, so `media.sweep` asks
-- every fifteen minutes which videos are still 'processing'.
--
-- That question must not scan PostMedia. There is one row per photograph in
-- the city and only a handful are ever in flight, so the index is PARTIAL:
-- it holds the rows the sweep wants and nothing else, it is a few kilobytes,
-- and it costs a write only while a video is in flight. A plain index on
-- `state` would be two values over millions of rows and the planner would
-- never choose it.
--
-- Prisma cannot express a partial index, so it lives here — see the note on
-- the PostMedia model in schema.prisma, which points back at this file.
--
-- CONCURRENTLY is deliberately not used, for the reason in 20260830T090000:
-- `prisma migrate deploy` wraps each migration in a transaction. On a large
-- PostMedia, build it by hand instead and mark this applied:
--
--   CREATE INDEX CONCURRENTLY "PostMedia_processing_idx"
--     ON "PostMedia"("id") WHERE "state" = 'processing' AND "kind" = 'video';
--   npx prisma migrate resolve --applied 20260906T170000_a_worker_of_its_own
--
-- IF NOT EXISTS makes both paths safe.

CREATE INDEX IF NOT EXISTS "PostMedia_processing_idx"
  ON "PostMedia"("id")
  WHERE "state" = 'processing' AND "kind" = 'video';

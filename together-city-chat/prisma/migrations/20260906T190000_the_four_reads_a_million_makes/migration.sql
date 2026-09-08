-- THE FOUR READS A MILLION MAKES (1M-DAU pass, 6 Sep).
--
-- Four indexes Prisma cannot express — two partial, one trigram, one with a
-- non-default operator class — behind four reads that were sequential scans of
-- the User table. `20260906T160000` took the five plain ones; these are the
-- rest, and the hottest of them runs on every feed page in the city.
--
-- 1 · "User_reachable_idx" — THE SUBQUERY ON EVERY FEED PAGE.
--     `REACHABLE_USER` (admin/account-reach.ts) is spread into the author
--     filter of every social read, every dating card read and the profile
--     grids. Prisma compiles a to-one relation filter as
--       "Post"."authorId" IN (SELECT "id" FROM "User"
--                             WHERE "deletedAt" IS NULL AND "suspendedAt" IS NULL)
--     and NEITHER column had an index, so the single hottest read in the app
--     hashed a full scan of User before it could return twenty-one posts.
--     Partial rather than plain: almost every account is reachable, so the
--     index holds almost every id — but it holds ONLY the id, it is index-only
--     for this semi-join, and it costs a write on suspend and delete rather
--     than on every presence flip.
--
-- 2 · "User_purge_due_idx" — the nightly account purge asks for twenty rows
--     ordered by "deletedAt" among a million, filtered on two columns with no
--     index. Partial, so it holds only the accounts actually awaiting purge:
--     a few rows, not a million.
--
-- 3 · "User_name_trgm_idx" — people search is
--     `name: { contains: q, mode: 'insensitive' }`, i.e. ILIKE '%q%', which no
--     btree can serve. The 29 Aug trigram migration covered Message.text and
--     the two mail columns and did not cover this one. Same DO block, for the
--     same reason: CREATE EXTENSION needs a privilege a managed role may not
--     have, and a migration that raises there takes the whole deploy down for
--     a performance index.
--
-- 4 · "User_handle_pattern_idx" — the other half of that OR is
--     `handle: { startsWith: … }`. `User_handle_key` cannot serve a prefix
--     match under a non-C collation; varchar_pattern_ops can.
--
-- CONCURRENTLY is deliberately not used — `prisma migrate deploy` wraps each
-- migration in a transaction. On a large User table build them by hand:
--
--   CREATE INDEX CONCURRENTLY "User_reachable_idx" ON "User"("id")
--     WHERE "deletedAt" IS NULL AND "suspendedAt" IS NULL;
--   CREATE INDEX CONCURRENTLY "User_purge_due_idx" ON "User"("deletedAt")
--     WHERE "purgedAt" IS NULL AND "deletedAt" IS NOT NULL;
--   CREATE INDEX CONCURRENTLY "User_handle_pattern_idx" ON "User"("handle" varchar_pattern_ops);
--   CREATE INDEX CONCURRENTLY "User_name_trgm_idx" ON "User" USING gin ("name" gin_trgm_ops);
--
-- then `npx prisma migrate resolve --applied 20260906T190000_the_four_reads_a_million_makes`.
-- IF NOT EXISTS makes both paths safe.

CREATE INDEX IF NOT EXISTS "User_reachable_idx" ON "User"("id")
  WHERE "deletedAt" IS NULL AND "suspendedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "User_purge_due_idx" ON "User"("deletedAt")
  WHERE "purgedAt" IS NULL AND "deletedAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "User_handle_pattern_idx" ON "User"("handle" varchar_pattern_ops);

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm could not be installed (%). People search stays unindexed; nothing else is affected.', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "User_name_trgm_idx" ON "User" USING gin ("name" gin_trgm_ops)';
  END IF;
END
$$;

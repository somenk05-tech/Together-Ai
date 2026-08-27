-- The name a citizen dates under.
--
-- Nullable, because the profiles arrived first: an existing row is drawn under
-- a deterministic generated handle (fallbackHandle) until its owner chooses.
-- No backfill, deliberately — a generated value written into the column would
-- be indistinguishable from a chosen one, and the whole point of the fallback
-- is that the form can tell the difference and ask.
--
-- UNIQUE, because two people sharing an identifier is the failure this column
-- exists to prevent. Postgres allows any number of NULLs under a unique index,
-- which is exactly the behaviour wanted here.
ALTER TABLE "DatingProfile" ADD COLUMN "handle" TEXT;
CREATE UNIQUE INDEX "DatingProfile_handle_key" ON "DatingProfile"("handle");

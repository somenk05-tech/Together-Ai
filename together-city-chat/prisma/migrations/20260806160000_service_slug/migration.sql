-- A business gets its own web address.
--
-- Nullable, and no backfill. A listing made before slugs existed is still
-- reachable by its id, and inventing an address for a shop that never chose one
-- would hand out a URL nobody asked for and cannot be told about. Owners pick
-- theirs on the edit page; new listings are offered one derived from the name.
--
-- UNIQUE, because two shops at one address is the bug this column exists to
-- make impossible. Partial index so the many NULLs do not collide with each
-- other.
ALTER TABLE "ServiceListing" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "ServiceListing_slug_key" ON "ServiceListing"("slug") WHERE "slug" IS NOT NULL;

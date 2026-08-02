-- The citizen's blood group, asked once on the Master Profile and skippable.
--
-- Nullable and unbackfilled, and here there is nothing it COULD be backfilled
-- from: no hub has ever held this, and it cannot be derived from a lab report,
-- a family member, or anything else in this database. NULL means nobody has
-- answered; the string 'unknown' means they answered and do not know. Those are
-- two different facts and the app says so differently.
ALTER TABLE "MasterProfile" ADD COLUMN "bloodGroup" TEXT;

-- The shop's own sign (owner, 24 Aug): a chosen logo, not whichever photo
-- happened to be first. Additive; existing listings fall back to their
-- first gallery photo exactly as before.
ALTER TABLE "ServiceListing" ADD COLUMN "logoUrl" TEXT;

-- The exact door (owner, 24 Aug): building name and road name on the listing.
-- Additive only; every existing listing simply has neither yet.
ALTER TABLE "ServiceListing" ADD COLUMN "building" TEXT;
ALTER TABLE "ServiceListing" ADD COLUMN "street" TEXT;

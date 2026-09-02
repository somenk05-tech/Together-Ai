-- A PHOTO THAT DOES NOT STAY.
--
-- Temporary media as a chat primitive: a snap is an Attachment row with a
-- clock on it, so every feature already built on Attachment reaches it.
--
-- Every column is nullable or defaulted, and `snapMode` NULL is the
-- discriminator, so every attachment that already exists is unaffected and
-- reads as what it has always been: an ordinary file. There is no backfill,
-- because there is nothing to convert.
ALTER TABLE "Attachment" ADD COLUMN "snapMode" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "snapLive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attachment" ADD COLUMN "snapViews" INTEGER;
ALTER TABLE "Attachment" ADD COLUMN "snapOpensJson" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "snapExpiresAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN "snapOpenedAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN "snapKeptAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN "snapShotAt" TIMESTAMP(3);
ALTER TABLE "Attachment" ADD COLUMN "snapGoneAt" TIMESTAMP(3);

-- The sweep's one question, asked every ten minutes forever: which snaps are
-- past their moment and still have bytes in the bucket.
CREATE INDEX "Attachment_snapExpiresAt_snapGoneAt_idx" ON "Attachment"("snapExpiresAt", "snapGoneAt");

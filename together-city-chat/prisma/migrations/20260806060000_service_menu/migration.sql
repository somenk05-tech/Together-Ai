-- A menu read off a photograph and then corrected by a human. The AI's output
-- is a draft and never reaches this table on its own.

ALTER TABLE "ServiceListing" ADD COLUMN "menuScanUrl" TEXT;

CREATE TABLE "ServiceMenuItem" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "section" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceInr" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceMenuItem_listingId_sortOrder_idx" ON "ServiceMenuItem"("listingId", "sortOrder");

ALTER TABLE "ServiceMenuItem" ADD CONSTRAINT "ServiceMenuItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

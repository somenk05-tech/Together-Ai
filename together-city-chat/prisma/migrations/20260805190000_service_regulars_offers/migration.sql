-- A citizen's own shortlist of businesses, and what a business is offering today.

CREATE TABLE "ServiceRegular" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceRegular_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceOffer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOffer_pkey" PRIMARY KEY ("id")
);

-- Saving twice is still saved once.
CREATE UNIQUE INDEX "ServiceRegular_userId_listingId_key" ON "ServiceRegular"("userId", "listingId");
CREATE INDEX "ServiceRegular_userId_createdAt_idx" ON "ServiceRegular"("userId", "createdAt");
-- "What is on today" is a range-containment read that runs on every visit.
CREATE INDEX "ServiceOffer_startsOn_endsOn_idx" ON "ServiceOffer"("startsOn", "endsOn");
CREATE INDEX "ServiceOffer_listingId_endsOn_idx" ON "ServiceOffer"("listingId", "endsOn");

ALTER TABLE "ServiceRegular" ADD CONSTRAINT "ServiceRegular_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceRegular" ADD CONSTRAINT "ServiceRegular_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOffer" ADD CONSTRAINT "ServiceOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

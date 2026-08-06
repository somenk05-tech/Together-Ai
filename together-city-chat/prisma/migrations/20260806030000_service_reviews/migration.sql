-- A review you had to earn (an existing thread with that business), signed with
-- the same alias the business already sees in the conversation.

CREATE TABLE "ServiceReview" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "ownerReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceReview_pkey" PRIMARY KEY ("id")
);

-- One review per person per business. A rating is a current opinion, not a log
-- of every opinion somebody has ever held.
CREATE UNIQUE INDEX "ServiceReview_listingId_reviewerId_key" ON "ServiceReview"("listingId", "reviewerId");
CREATE INDEX "ServiceReview_listingId_createdAt_idx" ON "ServiceReview"("listingId", "createdAt");

ALTER TABLE "ServiceReview" ADD CONSTRAINT "ServiceReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceReview" ADD CONSTRAINT "ServiceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

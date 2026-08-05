-- Local Services Hub: a citizen's own business, and the anonymous thread
-- somebody opens against it. Deliberately NOT the chat hub's tables — see the
-- note on ServiceEnquiry in schema.prisma.

CREATE TABLE "ServiceListing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "about" TEXT,
    "city" TEXT NOT NULL,
    "areas" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "priceFrom" INTEGER,
    "photosJson" TEXT NOT NULL DEFAULT '[]',
    "moderation" TEXT NOT NULL DEFAULT 'approved',
    "moderationJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceEnquiry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "seekerId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seekerUnread" INTEGER NOT NULL DEFAULT 0,
    "ownerUnread" INTEGER NOT NULL DEFAULT 0,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceEnquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceMessage" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "senderSide" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceListing_moderation_city_idx" ON "ServiceListing"("moderation", "city");
CREATE INDEX "ServiceListing_categoryKey_city_idx" ON "ServiceListing"("categoryKey", "city");
CREATE INDEX "ServiceListing_ownerId_idx" ON "ServiceListing"("ownerId");

-- One thread per person per business, forever. Pressing Chat twice returns to
-- the thread that already exists rather than starting a second one.
CREATE UNIQUE INDEX "ServiceEnquiry_listingId_seekerId_key" ON "ServiceEnquiry"("listingId", "seekerId");
CREATE INDEX "ServiceEnquiry_seekerId_lastMessageAt_idx" ON "ServiceEnquiry"("seekerId", "lastMessageAt");
CREATE INDEX "ServiceEnquiry_listingId_lastMessageAt_idx" ON "ServiceEnquiry"("listingId", "lastMessageAt");
CREATE INDEX "ServiceMessage_enquiryId_createdAt_idx" ON "ServiceMessage"("enquiryId", "createdAt");

ALTER TABLE "ServiceListing" ADD CONSTRAINT "ServiceListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceEnquiry" ADD CONSTRAINT "ServiceEnquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceEnquiry" ADD CONSTRAINT "ServiceEnquiry_seekerId_fkey" FOREIGN KEY ("seekerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceMessage" ADD CONSTRAINT "ServiceMessage_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "ServiceEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

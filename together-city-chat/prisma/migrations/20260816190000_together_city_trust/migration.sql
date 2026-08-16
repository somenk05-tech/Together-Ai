-- TOGETHER CITY TRUST.
--
-- The owner, 16 Aug: four verification levels, a tab under a listing to get
-- verified, and five new enquiries a day until it is - then free.
--
-- ONE THING IN HERE IS NOT ADDITIVE AND IT IS THE MOST IMPORTANT LINE.
-- "ServiceEnquiry"."openedAt" is NULL for a thread the business has not been
-- given yet. Every row that exists today HAS been given away - those
-- conversations are open, some of them are mid-job - so they are backfilled to
-- their own createdAt. Shipping the column with a bare NULL default would empty
-- every business inbox in the city on deploy and hand each of them back five a
-- day, which is a fair rule applied retrospectively to people who were never
-- told about it.
--
-- WHY THE TIER IS NOT A COLUMN. There is no "tier" anywhere below. It is
-- computed from the evidence in this table by one function every time anybody
-- asks, because a stored tier goes wrong the first time a document expires and
-- no job re-runs - silently, on a badge, which is the worst place in this
-- product for a stale value to sit.
--
-- Identity is on User and not here: a person proves who they are once and it
-- travels with them across every listing they own. The document is per listing,
-- because one is a fact about a person and the other is a fact about a shop.

-- ── the held queue ───────────────────────────────────────────────────────────
ALTER TABLE "ServiceEnquiry" ADD COLUMN "openedAt" TIMESTAMP(3);
UPDATE "ServiceEnquiry" SET "openedAt" = "createdAt" WHERE "openedAt" IS NULL;
CREATE INDEX "ServiceEnquiry_listingId_openedAt_idx" ON "ServiceEnquiry"("listingId", "openedAt");

-- ── the person ───────────────────────────────────────────────────────────────
-- The VERDICT, never the document. When a KYC provider is chosen these two
-- columns are all that changes; there is no product reason to hold a scan of
-- somebody's passport and every reason not to.
ALTER TABLE "User" ADD COLUMN "identityVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "identityMethod" TEXT;

-- ── the business ─────────────────────────────────────────────────────────────
CREATE TABLE "ServiceVerification" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "entityKind" TEXT,
    "docKind" TEXT,
    "docRef" TEXT,
    "docUrl" TEXT,
    "docStatus" TEXT NOT NULL DEFAULT 'none',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "rejectReason" TEXT,
    "placeConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceVerification_listingId_key" ON "ServiceVerification"("listingId");

-- The console queue reads submitted-oldest-first. The listing nobody got to on
-- Monday is the listing nobody gets to on Friday unless the index makes the
-- tail as cheap as the head.
CREATE INDEX "ServiceVerification_docStatus_submittedAt_idx" ON "ServiceVerification"("docStatus", "submittedAt");

ALTER TABLE "ServiceVerification" ADD CONSTRAINT "ServiceVerification_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

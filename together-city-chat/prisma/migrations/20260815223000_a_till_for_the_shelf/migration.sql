-- A TILL FOR THE SHELF.
--
-- The owner, 15 Aug: "create a Together City supplements cart, don't divert
-- users to external links." Two tables, and the second one is the reason the
-- first is allowed to exist.
--
-- SupplementBag is one row per citizen holding ids and quantities. No price is
-- stored: what a bag costs is read off products.ts every time it is shown and
-- again when it is paid for, so a bag left open for a week cannot lock in
-- yesterday's number.
--
-- SupplementOrder is the receipt, and it is a SNAPSHOT. itemsJson holds what
-- was actually charged rather than ids to re-price later, because a receipt
-- that changes when a shelf price changes is not a receipt.
--
-- Nutrition once had a checkout that debited the wallet and wrote seven
-- delivery rows nothing in the app ever rendered; the citizen paid and had
-- nowhere to see what they had bought, and it was removed. This migration ships
-- in the same commit as GET /fitness/store/orders, which is the only reason
-- a table that records a charge is being added at all.
--
-- Additive only. Nothing is dropped, nothing is rewritten, and no existing row
-- in this database is touched.

CREATE TABLE "SupplementBag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linesJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplementBag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplementBag_userId_key" ON "SupplementBag"("userId");

ALTER TABLE "SupplementBag" ADD CONSTRAINT "SupplementBag_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SupplementOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "totalInr" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'placed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplementOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplementOrder_userId_createdAt_idx" ON "SupplementOrder"("userId", "createdAt");

ALTER TABLE "SupplementOrder" ADD CONSTRAINT "SupplementOrder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

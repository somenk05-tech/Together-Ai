-- THE MENU TAKES ORDERS.
--
-- Two years of decisions meet here. The menu reader proposes and the owner
-- disposes (22 Aug); the till moves money through Invoice → PaymentIntent with
-- the wallet leg first (the commerce landing); the anonymous thread keeps a
-- citizen a number until they choose otherwise (16 Aug); and B.18 recorded
-- that the hub that starts delivering is the one that earns the right to ask
-- for an address. This migration is where a published menu becomes something a
-- citizen can actually order from — inside the thread, paid from the wallet,
-- accepted or rejected by the owner in the same room.
--
-- ADDITIVE ONLY. No table is dropped, no column narrowed, nothing backfilled
-- with a guess. Every new ServiceMenuItem column is nullable or defaulted so
-- existing menus keep meaning exactly what they meant yesterday.

-- ── the menu learns what a kitchen knows ────────────────────────────────────
-- `available` defaults TRUE: a menu that publishes an item is claiming to
-- serve it, and every row that exists today was published under that claim.
ALTER TABLE "ServiceMenuItem" ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true;
-- NULL is "the menu did not say" for all four of these, and it is not a value.
ALTER TABLE "ServiceMenuItem" ADD COLUMN "veg" TEXT;
ALTER TABLE "ServiceMenuItem" ADD COLUMN "spice" INTEGER;
ALTER TABLE "ServiceMenuItem" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "ServiceMenuItem" ADD COLUMN "prepMinutes" INTEGER;
ALTER TABLE "ServiceMenuItem" ADD COLUMN "variantsJson" TEXT;
ALTER TABLE "ServiceMenuItem" ADD COLUMN "addonsJson" TEXT;
-- Backfilled to createdAt, not now(): these rows were last touched when they
-- were written, and inventing a fresher timestamp claims an edit nobody made.
ALTER TABLE "ServiceMenuItem" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "ServiceMenuItem" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "ServiceMenuItem" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ServiceMenuItem" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- ── the order card in the thread ────────────────────────────────────────────
ALTER TABLE "ServiceMessage" ADD COLUMN "orderId" TEXT;

-- ── the order itself ────────────────────────────────────────────────────────
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "fulfilment" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "subtotalInr" INTEGER NOT NULL,
    "totalInr" INTEGER NOT NULL,
    "prepMinutes" INTEGER,
    "note" TEXT,
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "addressText" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "rejectReason" TEXT,
    "cancelReason" TEXT,
    "adjustmentNote" TEXT,
    "invoiceId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceOrder_number_key" ON "ServiceOrder"("number");
CREATE UNIQUE INDEX "ServiceOrder_invoiceId_key" ON "ServiceOrder"("invoiceId");
CREATE INDEX "ServiceOrder_listingId_status_createdAt_idx" ON "ServiceOrder"("listingId", "status", "createdAt");
CREATE INDEX "ServiceOrder_userId_createdAt_idx" ON "ServiceOrder"("userId", "createdAt");
CREATE INDEX "ServiceOrder_enquiryId_idx" ON "ServiceOrder"("enquiryId");

ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

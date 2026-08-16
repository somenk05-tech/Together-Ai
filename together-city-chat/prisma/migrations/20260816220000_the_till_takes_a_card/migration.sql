-- THE TILL TAKES A CARD.
--
-- A business bills a neighbour, the neighbour pays from a wallet or a card or
-- both, and the money reaches the business's bank the next working day.
--
-- EVERY LINE BELOW IS ADDITIVE. Seven new tables and one new nullable column on
-- ServiceMessage. Nothing existing is altered, nothing is backfilled, and a
-- deploy that rolls back leaves every row in the city exactly as it was.
--
-- WHAT IS NOT IN THIS MIGRATION, and the absence is the architecture: there is
-- no card number column, no expiry, no CVV, no account number and no IFSC. The
-- closest thing to a banking detail anywhere below is
-- "MerchantAccount"."accountLast4" — four digits, which every statement in the
-- country already prints — and "providerAccountRef", which is a handle a payout
-- provider gave us and from which nothing can be reconstructed. The promise
-- that Together City does not hold card or bank credentials is kept by there
-- being nowhere to put them, rather than by a rule somebody has to remember.
--
-- WHY THERE IS NO `status` COLUMN ON Invoice CARRYING 'paid'. There is one, and
-- it is deliberately not the authority: an invoice's real state is computed
-- from what has happened to it (commerce/money.ts, statusOf) — what was banked,
-- what was cancelled, what day it is. `overdue` in particular cannot be a
-- stored value, because it becomes true at midnight and no job runs then. The
-- column exists so a future report can filter cheaply; every screen reads the
-- computed one.
--
-- AMOUNTS ARE INTEGER RUPEES throughout, like every other price in this schema.

-- ── an invoice arriving in the thread it belongs to ─────────────────────────
-- Nullable, and every existing row keeps its NULL: a message written before
-- today carried no invoice and must not start claiming one.
ALTER TABLE "ServiceMessage" ADD COLUMN "invoiceId" TEXT;

-- ── where a business's money is sent ────────────────────────────────────────
CREATE TABLE "MerchantAccount" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "entityKind" TEXT NOT NULL DEFAULT 'individual',
    "providerAccountRef" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "accountLast4" TEXT,
    "bankName" TEXT,
    "taxRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'none',
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT,
    "rejectReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantAccount_listingId_key" ON "MerchantAccount"("listingId");
CREATE INDEX "MerchantAccount_ownerId_idx" ON "MerchantAccount"("ownerId");
-- A review queue reads submitted-oldest-first, for the reason the verification
-- queue's own index gives: the one nobody got to on Monday is the one nobody
-- gets to on Friday unless the tail is as cheap as the head.
CREATE INDEX "MerchantAccount_status_submittedAt_idx" ON "MerchantAccount"("status", "submittedAt");

-- ── what was owed ───────────────────────────────────────────────────────────
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotalInr" INTEGER NOT NULL DEFAULT 0,
    "discountInr" INTEGER NOT NULL DEFAULT 0,
    "taxInr" INTEGER NOT NULL DEFAULT 0,
    "extraInr" INTEGER NOT NULL DEFAULT 0,
    "totalInr" INTEGER NOT NULL DEFAULT 0,
    "paidInr" INTEGER NOT NULL DEFAULT 0,
    "refundedInr" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "dueOn" DATE,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
-- THE UNIQUE INDEX IS THE MECHANISM. Two businesses billing in the same second
-- both compute the same next number; Postgres refuses the second, and the retry
-- loop in invoices.service.ts turns that refusal into a second attempt. Without
-- this constraint the collision is silent and two documents share a number.
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_userId_status_createdAt_idx" ON "Invoice"("userId", "status", "createdAt");
CREATE INDEX "Invoice_listingId_status_createdAt_idx" ON "Invoice"("listingId", "status", "createdAt");
CREATE INDEX "Invoice_listingId_createdAt_idx" ON "Invoice"("listingId", "createdAt");

CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPriceInr" INTEGER NOT NULL DEFAULT 0,
    "amountInr" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceItem_invoiceId_position_idx" ON "InvoiceItem"("invoiceId", "position");

-- ── one attempt to pay it ───────────────────────────────────────────────────
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "amountInr" INTEGER NOT NULL,
    "walletInr" INTEGER NOT NULL DEFAULT 0,
    "cardInr" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'created',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "idempotencyKey" TEXT,
    "walletTxnId" TEXT,
    "refundedInr" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);
-- DUPLICATE PAYMENT PREVENTION, as a constraint rather than a check. A double
-- tap, a retried request and a webhook delivered twice all carry the key of the
-- attempt they are repeating; the second insert loses and is answered with the
-- first attempt's outcome. Checking for the key and then inserting is a
-- read-then-write, which is the same race this exists to close.
CREATE UNIQUE INDEX "PaymentIntent_userId_idempotencyKey_key" ON "PaymentIntent"("userId", "idempotencyKey");
CREATE INDEX "PaymentIntent_invoiceId_createdAt_idx" ON "PaymentIntent"("invoiceId", "createdAt");
CREATE INDEX "PaymentIntent_listingId_status_createdAt_idx" ON "PaymentIntent"("listingId", "status", "createdAt");
CREATE INDEX "PaymentIntent_userId_createdAt_idx" ON "PaymentIntent"("userId", "createdAt");

-- ── one transfer out ────────────────────────────────────────────────────────
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "grossInr" INTEGER NOT NULL DEFAULT 0,
    "feeInr" INTEGER NOT NULL DEFAULT 0,
    "taxInr" INTEGER NOT NULL DEFAULT 0,
    "adjustInr" INTEGER NOT NULL DEFAULT 0,
    "netInr" INTEGER NOT NULL DEFAULT 0,
    "expectedOn" DATE NOT NULL,
    "settledAt" TIMESTAMP(3),
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "destinationLast4" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Settlement_reference_key" ON "Settlement"("reference");
-- Sales are batched by the day they are EXPECTED to land, not the day they were
-- earned, so Friday, Saturday and Sunday collapse into Monday's payout by
-- construction. This index is what makes finding the open batch one lookup.
CREATE INDEX "Settlement_listingId_expectedOn_idx" ON "Settlement"("listingId", "expectedOn");
CREATE INDEX "Settlement_status_expectedOn_idx" ON "Settlement"("status", "expectedOn");
CREATE INDEX "Settlement_ownerId_idx" ON "Settlement"("ownerId");

CREATE TABLE "SettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    -- The invoice number, COPIED. A payout statement that loses its line items
    -- when an invoice is deleted is not a statement.
    "invoiceNumber" TEXT NOT NULL,
    "grossInr" INTEGER NOT NULL,
    "feeInr" INTEGER NOT NULL,
    "taxInr" INTEGER NOT NULL,
    "netInr" INTEGER NOT NULL,

    CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SettlementItem_settlementId_idx" ON "SettlementItem"("settlementId");

-- ── the business's own book ─────────────────────────────────────────────────
-- A balance is not a column anywhere in this migration. It is the sum of this
-- table, so there is no second place to update and therefore no second place to
-- forget. Available versus pending is a question about settlementId being null.
CREATE TABLE "MerchantLedgerEntry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountInr" INTEGER NOT NULL,
    "invoiceId" TEXT,
    "paymentIntentId" TEXT,
    "settlementId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MerchantLedgerEntry_listingId_createdAt_idx" ON "MerchantLedgerEntry"("listingId", "createdAt");
CREATE INDEX "MerchantLedgerEntry_listingId_settlementId_idx" ON "MerchantLedgerEntry"("listingId", "settlementId");
CREATE INDEX "MerchantLedgerEntry_ownerId_idx" ON "MerchantLedgerEntry"("ownerId");

-- ── the shopfront owns all of it ────────────────────────────────────────────
-- Every table above cascades from ServiceListing, which is what makes the purge
-- plan's rule true: an owner deleting their account takes the shopfront, and the
-- shopfront takes its invoices, its book and its payout account with it.
ALTER TABLE "MerchantAccount" ADD CONSTRAINT "MerchantAccount_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantLedgerEntry" ADD CONSTRAINT "MerchantLedgerEntry_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A ledger entry survives its payout being deleted, which should never happen,
-- and would be the one row worth keeping if it did. No cascade here on purpose.
ALTER TABLE "MerchantLedgerEntry" ADD CONSTRAINT "MerchantLedgerEntry_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

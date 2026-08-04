-- Two taps on "Add ₹500" credited ₹1,000.
--
-- A charge has been safe since the conditional decrement landed: the balance is
-- in the WHERE, so a second charge matches no rows and takes nothing. A TOP-UP
-- had no such guard. It was two statements outside a transaction — write the
-- ledger row, then increment the balance — so a retry ran both again, and a
-- failure between them left a ledger saying money arrived that never did.
--
-- Retries are not an edge case here. A double tap on a slow connection is one.
-- So is a PSP webhook, which every payment processor delivers at least once and
-- therefore sometimes twice; the audit asks for this BEFORE one is wired, which
-- is the only time it is cheap.
--
-- The key is the caller's own name for the attempt. The unique index is what
-- makes the second arrival a no-op instead of free money — enforced by Postgres
-- rather than by a read-then-write in application code, because a read-then-
-- write is exactly the race this is here to close.
--
-- NULLABLE, and that is deliberate. Every existing row predates the column and
-- callers that send no key still work as they always did. Postgres treats NULLs
-- as distinct in a unique index, so unkeyed top-ups do not collide with each
-- other — they simply get no protection, which is what they had before.
ALTER TABLE "WalletTxn" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "WalletTxn_userId_idempotencyKey_key"
  ON "WalletTxn" ("userId", "idempotencyKey");

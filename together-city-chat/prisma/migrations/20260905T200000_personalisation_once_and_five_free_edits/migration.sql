-- Owner rules, 5 Sep. A personalisation is written once and kept; a new one is
-- written only when the inputs it was written from change (the fingerprint).
-- And a citizen changes their profile five times a month for free across the
-- Master Profile and every hub profile, ₹50 each after; one row per change.
CREATE TABLE "Personalisation" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Personalisation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Personalisation_userId_kind_key" ON "Personalisation"("userId", "kind");
ALTER TABLE "Personalisation"
  ADD CONSTRAINT "Personalisation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProfileEdit" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "hub"       TEXT NOT NULL,
  "priceInr"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileEdit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProfileEdit_userId_createdAt_idx" ON "ProfileEdit"("userId", "createdAt");
ALTER TABLE "ProfileEdit"
  ADD CONSTRAINT "ProfileEdit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

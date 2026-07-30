-- Verification of a real email address and a real phone number (review p2, p3, p19).
--
-- Two columns on User and one new table. The interesting part is at the bottom:
-- the uniqueness rule is partial, and it has to be, for a reason worth writing
-- down rather than discovering later.

ALTER TABLE "User" ADD COLUMN "phoneE164" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VerificationCode_target_createdAt_idx" ON "VerificationCode"("target", "createdAt");
CREATE INDEX "VerificationCode_userId_channel_createdAt_idx" ON "VerificationCode"("userId", "channel", "createdAt");
CREATE INDEX "VerificationCode_ip_createdAt_idx" ON "VerificationCode"("ip", "createdAt");

ALTER TABLE "VerificationCode"
  ADD CONSTRAINT "VerificationCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Uniqueness, but only over what was proved.
--
-- A plain UNIQUE on phoneE164 would be wrong. Anyone can type any number into a
-- profile field, so an attacker could claim a stranger's number and lock the
-- real owner out of ever adding it — a denial of service that costs nothing to
-- mount. The number is only worth protecting once someone has answered a code
-- sent to it, so the constraint applies only to rows that got that far.
--
-- Same argument for email. The existing "email" column is set at sign-up and is
-- deliberately not unique (two people may mistype the same address); it is the
-- verified ones that must not collide.
--
-- deletedAt is in both predicates so a deleted account does not hold a number or
-- an address hostage. The account is gone; the person may want to sign up again.

CREATE UNIQUE INDEX "User_phoneE164_verified_key"
  ON "User"("phoneE164")
  WHERE "phoneVerifiedAt" IS NOT NULL AND "deletedAt" IS NULL;

-- Existing data may already break the email one. That column was never unique,
-- so two accounts could both have verified the same mailbox through the old
-- 24-hour link flow, which never checked. Rather than fail the deploy on an
-- opaque duplicate-key error, resolve it here, deterministically: the account
-- that verified FIRST keeps the address; the others are demoted to unverified
-- and will be asked to verify again.
--
-- That is the right way round. Whoever proved it first has the better claim,
-- and a later account holding a verified flag on someone else's mailbox is the
-- exact situation this index exists to prevent. A demoted user is not locked
-- out — they can sign in and verify a different address.
--
-- NULLS LAST in effect: a row with emailVerified set but no timestamp predates
-- the emailVerifiedAt column, so we cannot say when it was proved. An unknown
-- date is the weakest claim, not the strongest — which is what treating NULL as
-- "earliest" would imply.
UPDATE "User" u
SET "emailVerified" = FALSE, "emailVerifiedAt" = NULL
WHERE u."emailVerified" = TRUE
  AND u."deletedAt" IS NULL
  AND u."email" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "User" v
    WHERE v."id" <> u."id"
      AND v."deletedAt" IS NULL
      AND v."emailVerified" = TRUE
      AND LOWER(v."email") = LOWER(u."email")
      AND (
        (v."emailVerifiedAt" IS NOT NULL AND u."emailVerifiedAt" IS NULL)
        OR (v."emailVerifiedAt" < u."emailVerifiedAt")
        OR (v."emailVerifiedAt" IS NOT DISTINCT FROM u."emailVerifiedAt" AND v."id" < u."id")
      )
  );

-- The predicate is the BOOLEAN, not the timestamp.
--
-- emailVerified has always been the column of record; emailVerifiedAt arrived
-- later and is null on the oldest verified rows. Keying the index on the
-- timestamp would quietly exempt exactly those accounts from the uniqueness
-- rule, and would make them read as "unverified" in the profile while the
-- banner that nags about it stayed quiet — two screens disagreeing about the
-- same fact, which is the class of bug this whole review is about.
CREATE UNIQUE INDEX "User_email_verified_key"
  ON "User"(LOWER("email"))
  WHERE "emailVerified" = TRUE AND "deletedAt" IS NULL;

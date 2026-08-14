-- Mira's meter and her pass. Model-backed conversations only are counted:
-- the deterministic capabilities, navigation and the greeting never touch
-- this table, so the working city stays free. Two hundred conversations are
-- free for life; "paidUntil" is the rolling 30-day subscription (₹999 from
-- the city wallet) that continues them past the meter.
CREATE TABLE "MiraPass" (
    "userId" TEXT NOT NULL,
    "chatUsed" INTEGER NOT NULL DEFAULT 0,
    "paidUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiraPass_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "MiraPass" ADD CONSTRAINT "MiraPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

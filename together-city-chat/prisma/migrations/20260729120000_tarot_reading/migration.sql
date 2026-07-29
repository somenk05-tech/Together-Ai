-- TarotReading: the stored record of every draw.
--
-- Purely additive. Creates one new table and its indexes; touches nothing that
-- already exists, so it cannot drop or rewrite citizen data.
--
-- `period` is deliberately nullable and part of the unique key. Postgres treats
-- NULLs as distinct, so ("user", 'daily', '2026-07-29') is unique — one free
-- card per day — while ("user", 'three', NULL) can repeat as often as the
-- citizen pays for it.

-- CreateTable
CREATE TABLE "TarotReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT,
    "question" TEXT,
    "seed" TEXT NOT NULL,
    "readingJson" TEXT NOT NULL,
    "priceInr" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TarotReading_userId_createdAt_idx" ON "TarotReading"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TarotReading_userId_kind_period_key" ON "TarotReading"("userId", "kind", "period");

-- AddForeignKey
ALTER TABLE "TarotReading" ADD CONSTRAINT "TarotReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

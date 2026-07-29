-- Thought: a private journal entry.
--
-- Purely additive: one new table, its indexes and one foreign key. Nothing
-- existing is altered, so this cannot touch a row of citizen data.
--
-- deletedAt is nullable and there is no partial index on it: every read filters
-- `deletedAt IS NULL`, and the (userId, deletedAt) index serves that directly.

-- CreateTable
CREATE TABLE "Thought" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "mood" TEXT,
    "tags" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Thought_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thought_userId_createdAt_idx" ON "Thought"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Thought_userId_deletedAt_idx" ON "Thought"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Thought" ADD CONSTRAINT "Thought_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

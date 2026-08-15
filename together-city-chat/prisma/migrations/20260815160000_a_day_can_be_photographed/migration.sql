-- A DAY CAN BE PHOTOGRAPHED.
--
-- "Let people attach pictures for the day if they want to save a memory"
-- — the owner, 15 Aug.
--
-- No url column, deliberately. The bytes live in the private vault under
-- `daybook/<userId>/`, reachable only through a short-lived signed link the
-- API issues to the account that owns the key. A url column here would be a
-- permanent public address for the most private picture in the application.

CREATE TABLE "DayPhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DayPhoto_userId_date_idx" ON "DayPhoto"("userId", "date");

ALTER TABLE "DayPhoto" ADD CONSTRAINT "DayPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

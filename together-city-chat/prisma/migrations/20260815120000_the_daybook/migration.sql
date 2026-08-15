-- THE DAYBOOK: a day, as the person who lived it recorded it.
--
-- One page per citizen per day (how it felt, what was written), and any
-- number of items on that page (what was meant to happen). The date is a
-- plain YYYY-MM-DD string rather than a timestamp on purpose: a day is a
-- thing people live in their own timezone, and an instant re-read in
-- another zone silently becomes the day before.

CREATE TABLE "DayPage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "mood" TEXT,
    "feelNote" TEXT,
    "journal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DayPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DayPage_userId_date_key" ON "DayPage"("userId", "date");

CREATE TABLE "DayItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'task',
    "title" TEXT NOT NULL,
    "at" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DayItem_userId_date_idx" ON "DayItem"("userId", "date");

ALTER TABLE "DayPage" ADD CONSTRAINT "DayPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DayItem" ADD CONSTRAINT "DayItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- THE SPENDING LOG: the money the city did NOT move.
--
-- Every other row the Financial hub reads is something the city did — an order
-- it placed, a wallet it debited, a rate card it charged against. This table is
-- the other half of somebody's month: cash spent in a shop Together City has
-- never heard of, written down by the person who spent it.
--
-- A TABLE AND NOT JSON ON A PROFILE, which is the opposite of the call the gem
-- cart made one migration ago, and the difference is worth stating. A cart is
-- ONE evolving object per citizen, read and rewritten whole. A log is MANY
-- immutable rows, appended forever, read by month and summed. JSON would mean
-- rewriting a year of entries to add today's, and no index on the only thing
-- anybody filters by.
--
-- THREE COLUMNS AND NO CATEGORY. Asking somebody to file "auto to work, 80"
-- under one of seven headings before the entry will save is how a log stops
-- being written in. That is also why the hub's category totals cannot include
-- these as a category — they are counted in the month's total and reported
-- separately, so no per-category figure is ever quietly wrong.
--
-- `spentOn` IS date AND NOT timestamptz. A citizen logging yesterday's coffee
-- is naming a DAY, not an instant. Stored as an instant, an entry made at 01:00
-- in Asia/Kolkata falls in the previous UTC day and lands in the wrong month
-- for five and a half hours out of every twenty-four — the exact bug the shared
-- clock service exists to prevent everywhere else in this codebase.
CREATE TABLE IF NOT EXISTS "SpendLogEntry" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "spentOn"   DATE NOT NULL,
    "note"      TEXT NOT NULL,
    "amountInr" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendLogEntry_pkey" PRIMARY KEY ("id")
);

-- The only query this table has: one citizen, one month, newest first. Note is
-- never filtered on, so it is not indexed.
CREATE INDEX IF NOT EXISTS "SpendLogEntry_userId_spentOn_idx"
    ON "SpendLogEntry" ("userId", "spentOn");

-- ON DELETE CASCADE, like every other row hanging off a citizen here. A
-- deleted account takes its own handwriting with it.
ALTER TABLE "SpendLogEntry"
    ADD CONSTRAINT "SpendLogEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

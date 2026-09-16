-- ── THE CITY COUNTS ITS VISITORS (owner, 16 Sep) ───────────────────────────
-- "Add a counter for number of website visits, number of unique visits and
--  number of city members ... mention start date too."
--
-- One new table, nothing altered. One row per browser that has opened the
-- site: COUNT(*) is unique visitors, SUM("visits") is visits, MIN("firstAt")
-- is the day counting began on this database. The id is a random browser id
-- or a one-way hash — no address, no agent, no account is stored.
CREATE TABLE "SiteVisitor" (
    "id" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisitor_pkey" PRIMARY KEY ("id")
);

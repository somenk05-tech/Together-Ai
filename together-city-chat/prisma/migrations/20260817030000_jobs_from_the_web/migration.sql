-- JOBS FROM THE WEB.
--
-- Two new tables, nothing altered. ExternalJob holds live postings read from
-- companies' own public ATS boards (Greenhouse, Lever, Ashby), filtered to
-- India; only the scheduled scanner writes it, and a posting that disappears
-- from a re-scanned board is deleted rather than left to go stale — the city
-- must never claim a job is open on somebody else's site when it cannot know.
-- ExternalScanCursor remembers where each ATS directory sweep is, because the
-- public directories hold thousands of boards and each run scans a window.
--
-- Additive: a rollback drops both tables and touches nothing else.

CREATE TABLE "ExternalJob" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "boardSlug" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT NOT NULL,
    "blurb" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '',
    "seniority" TEXT NOT NULL DEFAULT 'mid',
    "postedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalJob_url_key" ON "ExternalJob"("url");
CREATE INDEX "ExternalJob_lastSeenAt_idx" ON "ExternalJob"("lastSeenAt");
CREATE INDEX "ExternalJob_source_boardSlug_idx" ON "ExternalJob"("source", "boardSlug");

CREATE TABLE "ExternalScanCursor" (
    "ats" TEXT NOT NULL,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalScanCursor_pkey" PRIMARY KEY ("ats")
);

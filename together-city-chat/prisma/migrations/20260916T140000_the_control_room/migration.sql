-- ── THE CONTROL ROOM BEHIND THE CITY (owner, 16 Sep) ───────────────────────
-- The investor and founder dashboard at /investor/analytics.
--
-- SiteVisitor learns where a first visit came from; MemberDay records which
-- city days a member was here and which systems they used; MemberOrigin keeps
-- the campaign a member first arrived with. Nothing is dropped or rewritten.
ALTER TABLE "SiteVisitor" ADD COLUMN "source" TEXT;
ALTER TABLE "SiteVisitor" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "SiteVisitor" ADD COLUMN "medium" TEXT;
ALTER TABLE "SiteVisitor" ADD COLUMN "campaign" TEXT;
ALTER TABLE "SiteVisitor" ADD COLUMN "content" TEXT;
ALTER TABLE "SiteVisitor" ADD COLUMN "term" TEXT;
ALTER TABLE "SiteVisitor" ADD COLUMN "referrer" TEXT;
ALTER TABLE "SiteVisitor" ADD COLUMN "device" TEXT;
CREATE INDEX "SiteVisitor_firstAt_idx" ON "SiteVisitor"("firstAt");

CREATE TABLE "MemberDay" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "systems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberDay_pkey" PRIMARY KEY ("userId","day")
);
CREATE INDEX "MemberDay_day_idx" ON "MemberDay"("day");

CREATE TABLE "MemberOrigin" (
    "userId" TEXT NOT NULL,
    "visitor" TEXT,
    "source" TEXT NOT NULL,
    "utmSource" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "referrer" TEXT,
    "landedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberOrigin_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "MemberOrigin_source_idx" ON "MemberOrigin"("source");

-- The days a member was here before today are already written down, one
-- record at a time, in each system's own tables; the dashboard reads those
-- directly (insights.service.ts). Only the day each existing member was last
-- seen is carried in here, so "active today" is right from the first minute.
INSERT INTO "MemberDay" ("userId", "day")
SELECT "id", to_char(("lastSeen" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
  FROM "User" WHERE "deletedAt" IS NULL
ON CONFLICT DO NOTHING;

-- ── THE CONTENT ANALYTICS (owner, 17 Sep) ──────────────────────────────────
-- "Add this to the analytics dashboard … a Combined View that aggregates
--  performance from every video and post across every connected platform."
--
-- Public counts only (the owner's choice): readings of each published post
-- (MediaMetric) and each account (ChannelMetric), and one row per arrival
-- through a Together Social link (SocialArrival). Three new tables and three
-- optional columns on MediaPost; nothing existing is changed.

ALTER TABLE "MediaPost" ADD COLUMN "series" TEXT;
ALTER TABLE "MediaPost" ADD COLUMN "episode" TEXT;
ALTER TABLE "MediaPost" ADD COLUMN "campaign" TEXT;

CREATE TABLE "MediaMetric" (
  "id"         TEXT NOT NULL,
  "targetId"   TEXT NOT NULL,
  "postId"     TEXT NOT NULL,
  "channel"    TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "views"      INTEGER,
  "likes"      INTEGER,
  "comments"   INTEGER,
  "shares"     INTEGER,
  "saves"      INTEGER,
  CONSTRAINT "MediaMetric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaMetric_targetId_capturedAt_idx" ON "MediaMetric"("targetId", "capturedAt");
CREATE INDEX "MediaMetric_postId_capturedAt_idx" ON "MediaMetric"("postId", "capturedAt");
ALTER TABLE "MediaMetric" ADD CONSTRAINT "MediaMetric_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "MediaTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChannelMetric" (
  "id"         TEXT NOT NULL,
  "platform"   TEXT NOT NULL,
  "topic"      TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "followers"  INTEGER,
  "views"      INTEGER,
  "posts"      INTEGER,
  CONSTRAINT "ChannelMetric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChannelMetric_platform_topic_capturedAt_idx" ON "ChannelMetric"("platform", "topic", "capturedAt");

CREATE TABLE "SocialArrival" (
  "id"      TEXT NOT NULL,
  "tag"     TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "visitor" TEXT NOT NULL,
  "at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialArrival_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SocialArrival_tag_at_idx" ON "SocialArrival"("tag", "at");
CREATE INDEX "SocialArrival_at_idx" ON "SocialArrival"("at");

-- ── ONE UPLOAD, EVERY CHANNEL (owner, 9 Sep; 17 Sep) ──────────────────────
-- 9 Sep: "Create a media page for Together City where I upload content in
--  the developer section and it goes to all social media pages and gets
--  uploaded on its own."
-- 17 Sep: "…all details are automatically uploaded on youtube and instagram
--  channels from there, connect dating with dating site, health with health."
--
-- The operator's media desk: one upload (MediaPost), one row per destination
-- saying what that platform did with it (MediaTarget), and the eighteen
-- sign-ins it posts with (SocialAccount). Three new tables, nothing existing
-- touched. The 9 Sep draft of the first two was never committed, so they are
-- created here whole.

CREATE TABLE "MediaPost" (
  "id"            TEXT NOT NULL,
  "authorId"      TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "topic"         TEXT NOT NULL DEFAULT 'world',
  "storageKey"    TEXT NOT NULL,
  "mediaUrl"      TEXT,
  "thumbUrl"      TEXT,
  "note"          TEXT,
  "title"         TEXT,
  "description"   TEXT,
  "tagsJson"      TEXT,
  "caption"       TEXT NOT NULL DEFAULT '',
  "threadsText"   TEXT,
  "overridesJson" TEXT,
  "privacy"       TEXT NOT NULL DEFAULT 'public',
  "aiDisclosure"  BOOLEAN NOT NULL DEFAULT false,
  "tvPostId"      TEXT,
  "tvMediaId"     TEXT,
  "state"         TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaPost_state_scheduledAt_idx" ON "MediaPost"("state", "scheduledAt");
CREATE INDEX "MediaPost_createdAt_idx" ON "MediaPost"("createdAt");
CREATE INDEX "MediaPost_topic_state_createdAt_idx" ON "MediaPost"("topic", "state", "createdAt");

CREATE TABLE "MediaTarget" (
  "id"          TEXT NOT NULL,
  "postId"      TEXT NOT NULL,
  "channel"     TEXT NOT NULL,
  "state"       TEXT NOT NULL DEFAULT 'pending',
  "skipReason"  TEXT,
  "externalId"  TEXT,
  "externalUrl" TEXT,
  "error"       TEXT,
  "notice"      TEXT,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "startedAt"   TIMESTAMP(3),
  "finishedAt"  TIMESTAMP(3),
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaTarget_postId_channel_key" ON "MediaTarget"("postId", "channel");
CREATE INDEX "MediaTarget_state_idx" ON "MediaTarget"("state");
ALTER TABLE "MediaTarget" ADD CONSTRAINT "MediaTarget_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "MediaPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One sign-in per platform per topic. The token is sealed (broadcast/seal.ts).
CREATE TABLE "SocialAccount" (
  "id"          TEXT NOT NULL,
  "platform"    TEXT NOT NULL,
  "topic"       TEXT NOT NULL,
  "externalId"  TEXT NOT NULL,
  "handle"      TEXT NOT NULL,
  "sealed"      TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3),
  "connectedBy" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refreshedAt" TIMESTAMP(3),
  "lastUsedAt"  TIMESTAMP(3),
  "lastError"   TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialAccount_platform_topic_key" ON "SocialAccount"("platform", "topic");

-- DATING, LAUNCH-READY (26 Aug). Four things the audit found in the schema.

-- 1. The table every dating read scans had one index, on userId.
CREATE INDEX "DatingProfile_visible_moderation_gender_seeking_birthDate_idx"
  ON "DatingProfile"("visible", "moderation", "gender", "seeking", "birthDate");
CREATE INDEX "DatingProfile_updatedAt_idx" ON "DatingProfile"("updatedAt");

-- 2. CompatibilityScore had no relation to User: orphans on delete, and a
--    half-table scan on the userB side of deleteProfile. Rows that already
--    point at a purged citizen are removed first so the constraint can be added.
DELETE FROM "CompatibilityScore" cs
  WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = cs."userA")
     OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = cs."userB");
ALTER TABLE "CompatibilityScore"
  ADD CONSTRAINT "CompatibilityScore_userA_fkey" FOREIGN KEY ("userA") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CompatibilityScore_userB_fkey" FOREIGN KEY ("userB") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CompatibilityScore_userB_idx" ON "CompatibilityScore"("userB");

-- 3. Message.sender was Restrict by default, so a citizen who had ever sent a
--    message could not be hard-deleted.
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_senderId_fkey";
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. One open report per reporter per target. Existing duplicates keep the
--    earliest row; the rest were the flood this closes.
DELETE FROM "Report" r
  USING "Report" older
  WHERE r."reporterId" = older."reporterId" AND r."targetType" = older."targetType"
    AND r."targetId" = older."targetId" AND r."createdAt" > older."createdAt";
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key"
  ON "Report"("reporterId", "targetType", "targetId");

-- Every dating photo is reviewed before another citizen sees it. Fail-closed:
-- a key with no row here is never signed for anyone but its owner.
CREATE TABLE "DatingPhotoReview" (
  "key" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "labels" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL DEFAULT '',
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DatingPhotoReview_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "DatingPhotoReview_userId_idx" ON "DatingPhotoReview"("userId");
CREATE INDEX "DatingPhotoReview_status_createdAt_idx" ON "DatingPhotoReview"("status", "createdAt");

-- First-party funnel events and moderation appeals.
CREATE TABLE "AppEvent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "userId" TEXT,
  "props" TEXT NOT NULL DEFAULT '{}',
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppEvent_name_at_idx" ON "AppEvent"("name", "at");
CREATE INDEX "AppEvent_userId_at_idx" ON "AppEvent"("userId", "at");

CREATE TABLE "Appeal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decision" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Appeal_userId_idx" ON "Appeal"("userId");
CREATE INDEX "Appeal_status_createdAt_idx" ON "Appeal"("status", "createdAt");

-- The moderation queue reports were already feeding, except that nothing read it.
--
-- social.report() has been writing Report rows since the hub shipped. The
-- schema comment called it "a moderation queue (reviewed out-of-band)" and
-- there was no out-of-band: no reader, no console, no reviewer. Filing a report
-- against a citizen did nothing at all.
--
-- Two additions, both nullable or defaulted so the deploy is a no-op for
-- existing rows.
--
-- Report gains a lifecycle. It stays append-only in spirit — nothing here
-- edits what the reporter wrote — but a row now records whether a moderator
-- has looked at it, who, when, and what they decided.
ALTER TABLE "Report" ADD COLUMN "status"       TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "Report" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Report" ADD COLUMN "reviewedAt"   TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "decision"     TEXT;

CREATE INDEX "Report_status_createdAt_idx" ON "Report" ("status", "createdAt");

-- A post gains a moderation state, so a decision can actually remove something.
--
-- A console that records "removed" while the post stays on the feed would be
-- worse than no console: it would let a moderator believe they had acted. The
-- default keeps every existing post exactly as visible as it is today.
ALTER TABLE "Post" ADD COLUMN "moderation" TEXT NOT NULL DEFAULT 'visible';

CREATE INDEX "Post_moderation_idx" ON "Post" ("moderation");

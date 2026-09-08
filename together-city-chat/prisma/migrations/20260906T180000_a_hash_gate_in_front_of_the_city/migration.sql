-- A HASH GATE IN FRONT OF THE CITY (1M-DAU pass, 6 Sep).
--
-- Every image surface passed through Rekognition's DetectModerationLabels and
-- nothing else. That is a taste-and-policy classifier; it does not do
-- perceptual-hash matching against a known-bad list, which is the only method
-- that reliably identifies child sexual abuse material. There was no hash list,
-- no hard block, no preservation, and no report.
--
-- media/hash-match now runs in front of Rekognition on all three guards. This
-- table is what it writes when it hits, and it is the report queue: a row with
-- reportedAt IS NULL is a report somebody still owes.
--
-- NO FOREIGN KEY TO "User", DELIBERATELY. Every other table naming a citizen
-- cascades on delete. This is evidence and it must outlive the account —
-- including an account closed by the person who uploaded the material.

CREATE TABLE IF NOT EXISTS "CsamHit" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "surface"    TEXT NOT NULL,
  "storageKey" TEXT,
  "bucket"     TEXT,
  "sha256"     TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedAt" TIMESTAMP(3),
  "reportRef"  TEXT,
  CONSTRAINT "CsamHit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CsamHit_reportedAt_detectedAt_idx" ON "CsamHit"("reportedAt", "detectedAt");
CREATE INDEX IF NOT EXISTS "CsamHit_userId_idx" ON "CsamHit"("userId");
CREATE INDEX IF NOT EXISTS "CsamHit_sha256_idx" ON "CsamHit"("sha256");

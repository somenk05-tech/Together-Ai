-- A LADDER A PHONE CAN CLIMB (1M-DAU pass, 6 Sep).
--
-- City TV played one progressive MP4 per video with no way to adapt. The owner
-- allows a 2 GB, 60-minute upload — 4.4 Mbit/s average — against the
-- 1–3 Mbit/s a mid-range Android sustains on Indian 4G at peak. With no ladder
-- the stream cannot step down, so it stalls; TUNE_MS then advances to the next
-- video, which also cannot play. On a weak connection the TV skipped through
-- the whole catalogue showing nothing but "Tuning in…".
--
-- One nullable column: the key of an HLS master playlist beside the MP4. The
-- MP4 stays exactly what it was and remains the fallback, so this is additive
-- in the strictest sense — every existing row keeps working with hlsUrl NULL,
-- and nothing backfills, because a ladder is built by re-encoding and that is
-- the transcode worker's job rather than a migration's.
--
-- Instant: a nullable column with no default does not rewrite the table.

ALTER TABLE "PostMedia" ADD COLUMN IF NOT EXISTS "hlsUrl" TEXT;

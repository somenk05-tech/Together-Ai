-- SHE IS THE SAME PERSON EVERYWHERE.
--
-- Five of Mira's inputs were facts about a CITIZEN being read out of a browser
-- tab: how long they had known her, whether the last turn ended somewhere
-- heavy, which character she was that day, and which openings she had already
-- used. A tab is per-device, editable by whoever holds the device, and empty
-- again after a refresh — so she was a different person on the phone and the
-- laptop, and a curl with `distressLocked: false` turned the safety latch off.
--
-- Five additive columns move all of it onto the account. Nothing is altered and
-- nothing is dropped; a rollback is five DROP COLUMNs and leaves every existing
-- pass exactly as it was.
--
-- "firstSeenAt" defaults to now, so every citizen who already has a pass reads
-- as having met her today. That is the honest backfill available — the row
-- carries no earlier timestamp than its own — and the only thing it costs is
-- one already-familiar citizen being greeted as new for two weeks.
ALTER TABLE "MiraPass" ADD COLUMN "distressUntil" TIMESTAMP(3);
ALTER TABLE "MiraPass" ADD COLUMN "greetings" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MiraPass" ADD COLUMN "forgetTopic" TEXT;
ALTER TABLE "MiraPass" ADD COLUMN "forgetAskedAt" TIMESTAMP(3);
ALTER TABLE "MiraPass" ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

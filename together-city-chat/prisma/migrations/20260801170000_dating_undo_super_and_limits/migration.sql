-- Undo a pass, a scarce super-like, and a daily like limit (M2).
--
-- DatingMatch recorded WHETHER you liked or passed and never WHEN, so three
-- things were unbuildable: "undo my last pass" had no way to know which pass
-- was last (updatedAt moves for likes, reveals and unmatches too), and any
-- daily limit had nothing to count.
--
-- Nullable and unbackfilled on purpose. A NULL passedAt on an existing passed
-- row means "passed before we started recording when", and undo deliberately
-- will not resurrect those: it only offers back a pass it can prove is the
-- most recent one. Backfilling them to now() would make every historical pass
-- look like it happened today and put a stranger from March at the top of
-- somebody's undo.
--
-- It also gives the flags a second job worth naming: unmatch() sets
-- passedByOne AND passedByTwo without a timestamp, so a timestamp is what
-- distinguishes a swipe-pass from an unmatch, and undo can tell them apart
-- without a status column that means two things.
ALTER TABLE "DatingMatch" ADD COLUMN "likedAtOne"  TIMESTAMP(3);
ALTER TABLE "DatingMatch" ADD COLUMN "likedAtTwo"  TIMESTAMP(3);
ALTER TABLE "DatingMatch" ADD COLUMN "passedAtOne" TIMESTAMP(3);
ALTER TABLE "DatingMatch" ADD COLUMN "passedAtTwo" TIMESTAMP(3);
ALTER TABLE "DatingMatch" ADD COLUMN "superByOne"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DatingMatch" ADD COLUMN "superByTwo"  BOOLEAN NOT NULL DEFAULT false;

-- The daily counters read "my likes since local midnight" from whichever side
-- of the pair I am on, so each side gets its own index.
CREATE INDEX "DatingMatch_userOneId_likedAtOne_idx" ON "DatingMatch"("userOneId", "likedAtOne");
CREATE INDEX "DatingMatch_userTwoId_likedAtTwo_idx" ON "DatingMatch"("userTwoId", "likedAtTwo");

-- Undo reads the latest pass per SIDE and compares in the service, because the
-- two columns are one logical field split across the pair row and SQL will not
-- reassemble it. Each of those two reads wants its own index.
CREATE INDEX "DatingMatch_userOneId_passedAtOne_idx" ON "DatingMatch"("userOneId", "passedAtOne");
CREATE INDEX "DatingMatch_userTwoId_passedAtTwo_idx" ON "DatingMatch"("userTwoId", "passedAtTwo");

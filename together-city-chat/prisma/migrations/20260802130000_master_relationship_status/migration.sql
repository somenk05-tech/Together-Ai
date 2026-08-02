-- The citizen's relationship status, asked once on the Master Profile.
--
-- Nullable and unbackfilled. There is nothing to backfill it FROM: dating's
-- relationshipGoal is what somebody is looking for, not what their situation
-- is, and Connection.relationship describes a pair rather than a person.
-- Deriving one from either would file a guess about somebody's life.
--
-- NULL means nobody has answered. The string 'preferNotToSay' means they were
-- asked and declined, which is a different fact and reads differently.
ALTER TABLE "MasterProfile" ADD COLUMN "relationshipStatus" TEXT;

-- Repair dating profiles the sex/gender split corrupted (§15.1).
--
-- 20260730200000_sex_and_gender introduced genderIdentity, whose non-binary
-- value is 'nonBinary'. DatingProfile.gender has always stored 'nonbinary' —
-- it predates the split and its DTO, its form select and its six matching
-- comparisons all use the lowercase spelling.
--
-- propagationPlan sent the identity value straight through:
--
--     const social = shared.genderIdentity ?? shared.gender ?? undefined;
--     dating: def({ gender: social, ... })
--
-- so every citizen who chose Non-binary on the Master Profile page had
-- 'nonBinary' written into their dating profile. Matching compares with === :
--
--     const iWant    = mine.seeking === 'any' || mine.seeking === cand.gender;
--     const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
--
-- Both sides are false for them against every candidate. They saw nobody, and
-- nobody seeking non-binary people saw them, with a profile that looked
-- complete. The Dating form's select had no matching option either, so the
-- field opened blank and re-asked a question they had already answered.
--
-- The code fix is datingGender(), the one crossing point between the two
-- vocabularies. This repairs the rows written before it existed.

UPDATE "DatingProfile" SET "gender" = 'nonbinary' WHERE "gender" = 'nonBinary';

-- `seeking` is written only by the Dating form, which has never offered the
-- identity vocabulary, so it cannot hold 'nonBinary'. Normalised anyway: this
-- is cheap, and a row that somehow held it would be a person who can never be
-- shown anyone.
UPDATE "DatingProfile" SET "seeking" = 'nonbinary' WHERE "seeking" = 'nonBinary';

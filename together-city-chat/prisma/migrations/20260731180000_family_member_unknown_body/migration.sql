-- FamilyMember stopped storing a stranger's body as the citizen's.
--
-- sex, age, heightCm and weightKg were NOT NULL with defaults "male", 30, 170
-- and 65. That is a reference body, written into a table, indistinguishable from
-- a real answer. Every reader downstream then honestly reported what it found:
-- computeTargets saw a complete body, `readiness` came back ok, and the BE-7.4
-- refusal — which exists precisely so nobody is shown a target computed for
-- somebody else — could never fire for a family member.
--
-- FoodPref already had this right. Its four equivalents are nullable and its own
-- comment says why: "the defaults read like answers and cannot be told apart
-- from real ones by inspecting them." This brings FamilyMember into line.
--
-- activity and goal keep their defaults on purpose. Sedentary and maintain are
-- true of a real population and do not fabricate a body; there is no honest
-- default for how much somebody weighs.

ALTER TABLE "FamilyMember" ALTER COLUMN "sex"      DROP NOT NULL;
ALTER TABLE "FamilyMember" ALTER COLUMN "sex"      DROP DEFAULT;
ALTER TABLE "FamilyMember" ALTER COLUMN "age"      DROP NOT NULL;
ALTER TABLE "FamilyMember" ALTER COLUMN "age"      DROP DEFAULT;
ALTER TABLE "FamilyMember" ALTER COLUMN "heightCm" DROP NOT NULL;
ALTER TABLE "FamilyMember" ALTER COLUMN "heightCm" DROP DEFAULT;
ALTER TABLE "FamilyMember" ALTER COLUMN "weightKg" DROP NOT NULL;
ALTER TABLE "FamilyMember" ALTER COLUMN "weightKg" DROP DEFAULT;

-- ── Clearing the values that were invented ────────────────────────────────
--
-- Nullable columns fix what gets written from here on. The rows already in the
-- table still hold whatever the substitution put there, and for most of them
-- there is no way to tell an invented 65 kg from a real one.
--
-- For SELF ROWS there is. ensureSelfMember built them as `pref?.x ?? <default>`,
-- so the value is real exactly when the owner's FoodPref holds one. Where
-- FoodPref is null, the member row's value came from the default and is not
-- about this person. That is a derivation, not a guess, and it is the only part
-- of this table that can be cleaned honestly.
UPDATE "FamilyMember" fm SET "sex" = NULL
  FROM "FoodPref" fp WHERE fm."isSelf" AND fp."userId" = fm."ownerId" AND fp."sex" IS NULL;
UPDATE "FamilyMember" fm SET "age" = NULL
  FROM "FoodPref" fp WHERE fm."isSelf" AND fp."userId" = fm."ownerId" AND fp."age" IS NULL;
UPDATE "FamilyMember" fm SET "heightCm" = NULL
  FROM "FoodPref" fp WHERE fm."isSelf" AND fp."userId" = fm."ownerId" AND fp."heightCm" IS NULL;
UPDATE "FamilyMember" fm SET "weightKg" = NULL
  FROM "FoodPref" fp WHERE fm."isSelf" AND fp."userId" = fm."ownerId" AND fp."weightKg" IS NULL;

-- A self row whose owner has no FoodPref at all took all four from the defaults.
UPDATE "FamilyMember" fm
   SET "sex" = NULL, "age" = NULL, "heightCm" = NULL, "weightKg" = NULL
 WHERE fm."isSelf"
   AND NOT EXISTS (SELECT 1 FROM "FoodPref" fp WHERE fp."userId" = fm."ownerId");

-- NON-SELF ROWS ARE DELIBERATELY LEFT ALONE, and it is worth being plain about
-- what that means. memberData() coerced a missing or unrecognised sex to "male"
-- and a missing age, height or weight to 30 / 170 / 65, so some of those rows
-- hold invented values too — and nothing distinguishes them from a household
-- where somebody really is a 30-year-old man of 170 cm and 65 kg. Nulling them
-- all would erase real answers people typed in; leaving them keeps a smaller
-- number of wrong ones. Every one of them corrects itself the next time that
-- member is edited, because the write path no longer substitutes.

-- The conditions a citizen declares about themselves, asked once on the Master
-- Profile, and the two qualifiers that already have rules branching on them.
--
-- THREE COLUMNS, NOT A JSON BLOB. Every existing reader of this data reads it
-- out of an `extras` blob — FoodPref.extras.healthConditions, FamilyMember.
-- extras, beauty's own copy — and reading a fifth list out of a blob is how
-- five vocabularies happened in the first place. Named columns with documented
-- NULL semantics is what bloodGroup, dietaryPreference, activityLevel and
-- relationshipStatus already do.
--
-- NULL means nobody has asked. The literal string 'none' means they were asked
-- and ticked nothing, which is an ANSWER and reads differently on screen — the
-- same distinction bloodGroup draws with 'unknown'. The empty string is never
-- written: mergeShared() treats '' as a gap to be filled from a hub source, so
-- storing "answered nothing" as '' would make it vanish on the next read.
--
-- NOTHING IS BACKFILLED, and here there IS something it could be backfilled
-- from: FoodPref.extras.healthConditions holds five display strings, and
-- FitnessProfile.conditions holds a four-value csv. Copying either now would
-- create a second editable copy of the same fact while the original still has
-- its own writer and its own form — which is precisely the defect the Master
-- Profile exists to remove, not one to add on the way to removing it. The
-- readers converge first; the copy moves when there is only one writer left.
ALTER TABLE "MasterProfile" ADD COLUMN "healthConditions" TEXT;

-- Pregnancy's qualifier. computeTargets adds +0 / +340 / +450 kcal by
-- trimester, so a plain tick would have to pick one for everybody. NULL means
-- not answered; 'unstated' means answered and would rather not say, which the
-- engine reads as the second trimester and says out loud wherever it shows the
-- figure. Cleared whenever pregnancy is not among the declared conditions.
ALTER TABLE "MasterProfile" ADD COLUMN "pregnancyTrimester" TEXT;

-- Kidney's qualifier. ckdEarly / ckdLate / dialysis are three different protein
-- ceilings and activeMntRules already branches three ways on the condition
-- TEXT; keys keep all three and change nothing. 'unstated' maps to ckdEarly
-- exactly as absent text does today. Cleared whenever kidney is not declared.
ALTER TABLE "MasterProfile" ADD COLUMN "kidneyStage" TEXT;

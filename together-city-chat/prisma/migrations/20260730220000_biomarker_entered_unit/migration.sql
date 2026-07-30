-- What the citizen's report printed, kept beside the converted value.
--
-- Nullable with NO default, deliberately. Every row that already exists was
-- entered before the form asked for a unit, so it genuinely does not know which
-- one was meant. `DEFAULT 'mg/dL'` would state an answer nobody gave — the same
-- mistake this whole review is about — and it would be indistinguishable from a
-- unit the person actually chose.
ALTER TABLE "MedicalBiomarker" ADD COLUMN "enteredValue" DOUBLE PRECISION;
ALTER TABLE "MedicalBiomarker" ADD COLUMN "enteredUnit" TEXT;

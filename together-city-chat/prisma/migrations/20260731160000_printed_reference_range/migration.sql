-- The reference interval the citizen's own lab printed (BE-3.2b).
--
-- BE-3.2a established that every band this app judges a blood result against is
-- one adult interval covering both sexes. Haemoglobin 12-17.5 g/dL is the union
-- of the male and female ranges, and a union is wider than either half, so it
-- under-calls abnormality at one end for everybody in it. A man at 12.4 is
-- anaemic and clears 12.
--
-- We cannot fix the bands: there is no source in the repo for sex-specific
-- reference intervals, and writing them from memory is the mistake we refused to
-- make with the micronutrient tables. But the citizen's own report already
-- carries the right answer. The lab applied their sex, their age and their own
-- assay to produce it. report-parser.ts has always found those intervals -- it
-- has to, so a bound is never mistaken for a result -- and threw them away.
--
-- Nullable, so this deploy changes nothing for a single existing row. A panel
-- with no stored interval keeps being read against the general adult band and
-- keeps carrying the caveat BE-3.2a added. A panel with one loses the caveat,
-- because for that marker it no longer applies.
ALTER TABLE "MedicalBiomarker" ADD COLUMN "refLow"  DOUBLE PRECISION;
ALTER TABLE "MedicalBiomarker" ADD COLUMN "refHigh" DOUBLE PRECISION;

-- Both may be null on a row that has one: "< 5.0" states an upper bound and no
-- lower one, and inventing a zero would be inventing the lab's opinion.

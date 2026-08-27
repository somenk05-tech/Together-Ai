-- Sexual orientation, asked at registration (owner, 27 Aug).
--
-- SPECIAL-CATEGORY DATA under GDPR Article 9 and its equivalents. Nullable
-- because every account that already exists predates the question and must not
-- be locked out of a city it already lives in — the same rule the date-of-birth
-- column follows. New accounts are required to answer at the schema.
--
-- No index. Nothing queries by it, and nothing is meant to: the dating engine
-- matches on DatingProfile.gender and .seeking. An index here would be the
-- first step towards a query that should not exist.
ALTER TABLE "MasterProfile" ADD COLUMN "orientation" TEXT;
ALTER TABLE "MasterProfile" ADD COLUMN "orientationOther" TEXT;

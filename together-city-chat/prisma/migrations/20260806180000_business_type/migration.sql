-- A listing knows what KIND of business it is, and holds the answers only that
-- kind was asked for.
--
-- Two columns rather than forty. The alternative -- a column per field across
-- every trade in the city -- means a migration every time a trade gets a new
-- question, a table of mostly-null columns, and a schema that has hard-coded
-- today's guess about what a hairdresser needs. detailsJson holds
-- { fieldKey: value }; business-types.ts is what gives those keys meaning, and
-- business-types.spec.ts is what the database cannot check for us.
--
-- Both nullable. Every listing made before this has no type and keeps working:
-- its page renders the base sections, and the owner picks a type when they
-- next edit. Guessing one from the category would put words in a shop's mouth.
ALTER TABLE "ServiceListing" ADD COLUMN "businessType" TEXT;
ALTER TABLE "ServiceListing" ADD COLUMN "detailsJson" TEXT;

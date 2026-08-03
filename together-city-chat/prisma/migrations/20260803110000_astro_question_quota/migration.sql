-- Five free consultations per citizen, then ₹100 for the next five.
--
-- A COUNTER, NOT A COUNT. The obvious implementation is
-- `count(AstroQuestion where userId = ...)`, and it was wrong the moment
-- consultations became deletable in the same week: delete five answers, get
-- five free questions, for ever, to anybody who noticed. This column only ever
-- goes up. Deleting a consultation removes the row and leaves the number.
--
-- It lives on AstroProfile rather than on User because a consultation cannot be
-- asked without a birth profile — the row is guaranteed to exist wherever the
-- allowance is read, and the astrology hub's numbers stay inside the astrology
-- hub's table.
--
-- THE BACKFILL COUNTS ONLY THE FREE ONES. Consultations from before this
-- change carry the price actually paid for them: ₹75 in the first era, ₹0 while
-- the paywall was down. Charging somebody again for a consultation they already
-- paid ₹75 for would be taking the same money twice, so paid rows do not spend
-- the free allowance. The free ones do — otherwise a citizen who has already
-- had twelve consultations at no charge gets five more.
ALTER TABLE "AstroProfile" ADD COLUMN "questionsAsked" INTEGER NOT NULL DEFAULT 0;

UPDATE "AstroProfile" p
SET "questionsAsked" = (
  SELECT COUNT(*) FROM "AstroQuestion" q
  WHERE q."userId" = p."userId" AND q."priceInr" = 0
);

-- The column default said 75, from the era when every consultation cost ₹75.
-- Every row is written with an explicit price and always has been, so this
-- changes no data — but a default nobody uses is still a number in the schema
-- claiming a consultation costs ₹75, and the next person to read it would have
-- no way to know that it is decoration.
ALTER TABLE "AstroQuestion" ALTER COLUMN "priceInr" SET DEFAULT 0;

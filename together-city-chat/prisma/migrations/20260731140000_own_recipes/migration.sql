-- A citizen's own recipes, in the same table as the world corpus.
--
-- authorId NULL is the corpus: 12,976 rows that passed the build-time diet
-- integrity check and the boot-time nutrition QA audit. authorId set is one
-- person's own dish, visible only to them.
--
-- One table rather than two, deliberately. Every consumer of a recipe — the
-- planner's ranking, the grocery builder, the recipe page, the QA audit, the
-- allergen screen — reads Recipe. A second table would mean each of those
-- growing a second code path, and the one that got forgotten would be the one
-- that skipped a safety check. A nullable owner column cannot be forgotten in
-- the same way: a query that omits it returns too much and is caught, rather
-- than returning too little and looking fine.
ALTER TABLE "Recipe" ADD COLUMN "authorId" TEXT;

-- Where the numbers came from. 'computed' means the server worked them out from
-- the ingredient list with the same Atwater audit the corpus gets. 'author'
-- means the citizen typed them in, having had the computed figures in front of
-- them, and every screen showing this dish says so. The default is 'computed'
-- because that is what all 12,976 existing rows are.
ALTER TABLE "Recipe" ADD COLUMN "nutritionSource" TEXT NOT NULL DEFAULT 'computed';

-- The fraction of ingredient mass the nutrition table recognised, 0–100.
-- Stored rather than recomputed so a recipe page can say "worked out from 72%
-- of the ingredients" without re-running the audit, and so a low-coverage dish
-- can be found later if the table improves.
ALTER TABLE "Recipe" ADD COLUMN "coveragePct" INTEGER NOT NULL DEFAULT 100;

CREATE INDEX "Recipe_authorId_idx" ON "Recipe"("authorId");

-- Deleting an account takes its recipes with it. ON DELETE CASCADE rather than
-- SET NULL: a citizen's own dish must never quietly become part of the corpus
-- everybody plans from.
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

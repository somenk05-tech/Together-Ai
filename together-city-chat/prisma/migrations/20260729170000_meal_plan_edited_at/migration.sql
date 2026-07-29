-- MealPlan.editedAt — the moment a citizen last changed their own plan.
--
-- Purely additive: one nullable column, no default, no backfill. Every existing
-- plan reads NULL, which means "untouched since generation" — the behaviour
-- everyone has today.
--
-- Deliberately nullable rather than a boolean with a default. "Never edited" and
-- "edited at some point" are different facts from "edited on Tuesday", and the
-- timestamp is what lets the UI say how recently the citizen made this theirs.

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN "editedAt" TIMESTAMP(3);

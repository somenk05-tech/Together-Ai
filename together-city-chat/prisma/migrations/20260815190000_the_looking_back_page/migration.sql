-- THE LOOKING-BACK PAGE.
--
-- The owner's reference, 15 Aug: a printed self-reflection sheet. What went
-- well, what you are proud of, three things you are grateful for, what was
-- difficult, what it taught you, the win, the challenge, tomorrow's focus,
-- and a 1-10 reading of the day.
--
-- One column, not eleven. The prompts on a reflection sheet are the part of
-- it most likely to be reworded, and a product that needs a migration to
-- reword a question stops rewording its questions. The keys are named and
-- validated in the API; this is a shape, not a bucket.
--
-- Nullable with no default, so every day already written stays exactly as it
-- was: no page is rewritten by this, and an old day simply has nothing here.

ALTER TABLE "DayPage" ADD COLUMN "reflection" JSONB;

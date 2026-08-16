-- A WORKOUT HAS A PLACE.
--
-- One nullable column, and nullable is the whole design of it. Every row
-- written before 17 Aug was logged without anybody being asked where the work
-- happened, and a DEFAULT would file hundreds of past sessions in a room the
-- citizen never named. NULL means "we did not ask" — which is a different fact
-- from "at home", and the page prints the difference.
--
-- Additive and nothing backfilled: a rollback leaves every row as it was.
ALTER TABLE "WorkoutLog" ADD COLUMN "style" TEXT;

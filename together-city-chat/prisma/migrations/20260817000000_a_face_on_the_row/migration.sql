-- A FACE ON THE ROW.
--
-- One nullable column, and every line of this migration is additive: nothing
-- existing is altered, nothing is backfilled, so a rollback leaves every row in
-- the city exactly as it was. NULL is the ordinary state and means "draw
-- whoever is on the other side, from their own profile" — the column only holds
-- the picture a reader has chosen to put there instead.
ALTER TABLE "ConversationMember" ADD COLUMN "photo" TEXT;

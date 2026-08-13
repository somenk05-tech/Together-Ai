-- EVERY PROJECT HAS AN ID, AND THE ID IS THE SAME MAILBOX.
--
-- `you+abg@togethercity.app` — one address, one inbox, one 10 GB quota. The
-- tag after the `+` is not a second account and grants nothing: mail sent to
-- it lands where mail to `you@` lands. All it does is say which room the
-- message belongs to, so a reply files itself without anything having to
-- guess.
--
-- WHY IT IS ON RATHER THAN OFFERED. Outbound mail from a project is sent
-- Reply-To that address. Thread inheritance already files most replies, but it
-- leans on matching an arrival to a trail by sender and normalised subject,
-- and that misses exactly when it costs most: a recipient who rewrites the
-- subject, replies from a client that drops the thread, or forwards it to a
-- colleague who writes back cold. With the id on, the room travels in the
-- address and comes home in it.
ALTER TABLE "MailProject" ALTER COLUMN "subAddress" SET DEFAULT true;

-- The projects that already exist were made in the day this feature has been
-- alive, under a default of false, and the owner has asked for every project
-- to carry an id. Switching them on costs nothing that can be lost: it does
-- not move a single message, it only lets a future arrival name a room.
UPDATE "MailProject" SET "subAddress" = true WHERE "subAddress" = false;

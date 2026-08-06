-- A business can choose to publish its own number.
--
-- Defaults to FALSE, and that default is the whole point. Every owner who has
-- already typed a number did so under a form that said "Only you ever see
-- this. It is not shown on your listing." Turning those on by migration would
-- publish a phone number on the strength of a promise the application made and
-- then broke. They stay off until each owner says otherwise.
ALTER TABLE "ServiceListing" ADD COLUMN "phonePublic" BOOLEAN NOT NULL DEFAULT false;

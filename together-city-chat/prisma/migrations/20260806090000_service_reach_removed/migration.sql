-- "I come to you" and "I work online too" leave the listing form.
--
-- They were two boolean claims a business made about itself that nothing in the
-- app ever checked, filtered on, or sorted by — they rendered as a tail on the
-- card and did nothing else. A directory that carries a claim it cannot act on
-- is a directory teaching people that its fields do not mean anything.
--
-- Dropped rather than left standing. An unread column is where the next
-- feature quietly starts trusting a value nobody has maintained.
ALTER TABLE "ServiceListing" DROP COLUMN IF EXISTS "homeVisit";
ALTER TABLE "ServiceListing" DROP COLUMN IF EXISTS "onlineOk";

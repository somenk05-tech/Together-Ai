-- A photo review verdict is about the BYTES, not about the key.
-- Nullable on purpose: rows reviewed before this migration keep a null etag and
-- are grandfathered at serve time. Their presigned upload windows expired long
-- ago, so there is nothing left for them to be swapped with, and the next
-- review of any of them records one.
ALTER TABLE "DatingPhotoReview" ADD COLUMN "etag" TEXT;

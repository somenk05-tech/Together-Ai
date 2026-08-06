-- Where a business actually is, so a map can draw it and a radius filter can
-- answer. All nullable: a listing made before this has no coordinates and must
-- keep appearing in the directory by city and area, not vanish from it.
ALTER TABLE "ServiceListing" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "ServiceListing" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "ServiceListing" ADD COLUMN "radiusKm" INTEGER;
ALTER TABLE "ServiceListing" ADD COLUMN "homeVisit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceListing" ADD COLUMN "onlineOk" BOOLEAN NOT NULL DEFAULT false;

-- A bounding-box read is what a map viewport asks for, and it asks on every pan.
-- Postgres will not use a b-tree for a two-column range on its own, so the
-- index is on lat with lng alongside — enough for a city-sized dataset. When
-- this outgrows it the answer is PostGIS and a GiST index, not a third b-tree.
CREATE INDEX "ServiceListing_lat_lng_idx" ON "ServiceListing"("lat", "lng");

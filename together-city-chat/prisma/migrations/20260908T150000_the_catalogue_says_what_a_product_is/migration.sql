-- ── THE CITY'S GROCERY CATALOGUE (owner, 8 Sep) ─────────────────────────────
-- "create an online grocery store using the internet, show all the products
-- that's available in an area."
--
-- The catalogue holds a product's IDENTITY — brand, pack, barcode, photograph,
-- and the public database it was read out of. It holds NO PRICE, and it never
-- will: the price on the shelf is the shopkeeper's, on their own menu row,
-- which is the whole reason this table and ServiceMenuItem are two tables.
--
-- ServiceMenuItem.productId is the join, nullable and ON DELETE SET NULL:
-- retiring a catalogue row must never delete a shopkeeper's line.

CREATE TABLE "GroceryProduct" (
    "id"         TEXT NOT NULL,
    "aisle"      TEXT NOT NULL,
    "brand"      TEXT,
    "name"       TEXT NOT NULL,
    "pack"       TEXT,
    "gtin"       TEXT,
    "imageUrl"   TEXT,
    "loose"      BOOLEAN NOT NULL DEFAULT false,
    "sourceKey"  TEXT NOT NULL,
    "sourceRef"  TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroceryProduct_gtin_key" ON "GroceryProduct"("gtin");
CREATE UNIQUE INDEX "GroceryProduct_sourceKey_sourceRef_key" ON "GroceryProduct"("sourceKey", "sourceRef");
CREATE INDEX "GroceryProduct_aisle_name_idx" ON "GroceryProduct"("aisle", "name");
CREATE INDEX "GroceryProduct_searchText_idx" ON "GroceryProduct"("searchText");

ALTER TABLE "ServiceMenuItem" ADD COLUMN "productId" TEXT;
CREATE INDEX "ServiceMenuItem_productId_idx" ON "ServiceMenuItem"("productId");
ALTER TABLE "ServiceMenuItem" ADD CONSTRAINT "ServiceMenuItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "GroceryProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

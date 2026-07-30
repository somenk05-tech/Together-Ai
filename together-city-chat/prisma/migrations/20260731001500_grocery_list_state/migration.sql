-- Whether a grocery line is in the basket yet.
--
-- Check state lived in a React useState, so it survived exactly as long as the
-- page did. Somebody halfway round a supermarket who switched apps or let the
-- screen lock came back to a list with nothing ticked.
--
-- The unique key on (user, item) is what makes regeneration a MERGE: a line
-- still needed keeps its tick, a line no longer needed drops out, and a line
-- added by hand stays, because nothing generated it in the first place.
CREATE TABLE "GroceryListItem" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "aisle"     TEXT NOT NULL DEFAULT '',
  "qtyLabel"  TEXT NOT NULL DEFAULT '',
  "checked"   BOOLEAN NOT NULL DEFAULT false,
  "source"    TEXT NOT NULL DEFAULT 'plan',
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroceryListItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroceryListItem_userId_key_key" ON "GroceryListItem"("userId", "key");
CREATE INDEX "GroceryListItem_userId_checked_idx" ON "GroceryListItem"("userId", "checked");

ALTER TABLE "GroceryListItem" ADD CONSTRAINT "GroceryListItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

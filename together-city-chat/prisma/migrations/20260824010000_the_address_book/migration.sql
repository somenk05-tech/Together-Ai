-- THE ADDRESS BOOK — home, office, other. Additive only; the legacy
-- MasterProfile.address keeps meaning exactly what it meant, and a save
-- labelled "home" mirrors into it so nothing that read it breaks.
CREATE TABLE "SavedAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedAddress_userId_label_key" ON "SavedAddress"("userId", "label");

ALTER TABLE "SavedAddress" ADD CONSTRAINT "SavedAddress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

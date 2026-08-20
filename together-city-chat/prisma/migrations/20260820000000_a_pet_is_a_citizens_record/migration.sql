-- A PET IS A CITIZEN'S RECORD.
--
-- The Pet District kept its pets in a zustand store and said so in its own
-- README: a reload started the demo again. Two tables move that record behind
-- the account, where the rest of the city keeps a citizen's own data.
--
-- ADDITIVE ONLY. Two new tables, two new foreign keys, nothing altered and
-- nothing backfilled — there is no existing pet anywhere to migrate, because
-- until this migration there was nowhere to have kept one. A rollback is two
-- DROP TABLEs and leaves every other row exactly as it was.
--
-- Both tables cascade from "User". A citizen who deletes their account deletes
-- their animals' records with it; a photograph's own bytes are removed from
-- the private vault by the purge plan, which reads "fileKey" the same way it
-- does for the daybook.
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT NOT NULL DEFAULT '',
    "dob" TEXT,
    "ageMonths" INTEGER,
    "sex" TEXT,
    "weightKg" DOUBLE PRECISION,
    "targetWeightKg" DOUBLE PRECISION,
    "bodyCondition" TEXT NOT NULL DEFAULT 'ideal',
    "activity" TEXT NOT NULL DEFAULT 'moderate',
    "housing" TEXT NOT NULL DEFAULT 'indoor',
    "sterilised" BOOLEAN,
    "allergies" JSONB,
    "sensitivities" JSONB,
    "restrictions" JSONB,
    "currentFood" TEXT NOT NULL DEFAULT '',
    "dietStyle" TEXT NOT NULL DEFAULT 'commercial',
    "goal" TEXT NOT NULL DEFAULT 'maintain',
    "healthNotes" TEXT NOT NULL DEFAULT '',
    "medical" JSONB,
    "portrait" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PetPhoto" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- The object key in the private vault, under `pets/<userId>/`. The prefix
    -- IS the permission: a key handed in by a browser is checked against the
    -- caller's own namespace before a row is ever written.
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    -- 0 is the face every card in the district draws.
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pet_userId_idx" ON "Pet"("userId");
CREATE INDEX "PetPhoto_petId_position_idx" ON "PetPhoto"("petId", "position");
CREATE INDEX "PetPhoto_userId_idx" ON "PetPhoto"("userId");

ALTER TABLE "Pet" ADD CONSTRAINT "Pet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetPhoto" ADD CONSTRAINT "PetPhoto_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetPhoto" ADD CONSTRAINT "PetPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

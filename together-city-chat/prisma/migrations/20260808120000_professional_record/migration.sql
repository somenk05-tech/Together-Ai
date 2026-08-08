-- THE PROFESSIONAL RECORD: one table, not eight.
--
-- A job, a degree, a certificate, a project, an award, a language and a link
-- are the same SHAPE -- a thing with a name, somewhere it happened, a span of
-- time, some prose and some tags. Eight tables would be eight migrations,
-- eight DTOs, eight CRUD surfaces and eight editors that drift apart, and it
-- would still not answer the part that matters most: a filmmaker's profile
-- leads with credits and a doctor's with specialisations. Sections that differ
-- by profession cannot be a fixed set of tables. They have to be data.
--
-- So one row per entry, `kind` says what it is, `order` says where it sits,
-- and JobProfile.sectionOrder says which sections lead. A new section type --
-- filmography, publications, patents, clients -- is a new `kind` rather than a
-- migration.
--
-- CONFIDENCE IS A COLUMN. The reader records how sure it was AT THE MOMENT IT
-- READ, because that is the only moment the evidence exists. Anything below
-- 'high' renders as "please confirm" and never as a fact the citizen is
-- asserting. `source` says who wrote the row, so a citizen's own correction is
-- never overwritten by a later upload.
CREATE TABLE "CvEntry" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL DEFAULT '',
    "organisation" TEXT NOT NULL DEFAULT '',
    "qualifier" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    -- Dates are kept AS WRITTEN. A CV says "2019", "Mar 2019", "Spring 2019"
    -- and "2019-present"; parsing that into a timestamp invents a day the
    -- document never claimed. startSort is yyyymm, 0 when unknown -- sortable
    -- without pretending to a precision the source did not have.
    "startText" TEXT NOT NULL DEFAULT '',
    "endText" TEXT NOT NULL DEFAULT '',
    "startSort" INTEGER NOT NULL DEFAULT 0,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "bullets" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT 'high',
    "source" TEXT NOT NULL DEFAULT 'citizen',
    "evidence" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CvEntry_profileId_kind_order_idx" ON "CvEntry"("profileId", "kind", "order");

ALTER TABLE "CvEntry" ADD CONSTRAINT "CvEntry_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "JobProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Employment, availability and preferences. Every one defaults to '' rather
-- than to a value, because "nobody has asked" is a different fact from any
-- answer -- and the AI is forbidden from assuming either.
ALTER TABLE "JobProfile" ADD COLUMN "employmentStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "openToOffers" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "employmentTypes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "workModes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "relocate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "preferredPlaces" TEXT NOT NULL DEFAULT '';

-- Compensation. Never inferred from a CV; whole currency units per year.
ALTER TABLE "JobProfile" ADD COLUMN "currentFixed" INTEGER;
ALTER TABLE "JobProfile" ADD COLUMN "currentVariable" INTEGER;
ALTER TABLE "JobProfile" ADD COLUMN "expectedMin" INTEGER;
ALTER TABLE "JobProfile" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "JobProfile" ADD COLUMN "salaryPeriod" TEXT NOT NULL DEFAULT 'annual';

-- VISIBILITY DEFAULTS TO PRIVATE, deliberately.
--
-- /jobs/profile currently prints "There's no candidate directory -- companies
-- can't browse or search you." These columns make that a setting rather than a
-- structural fact, and the default has to keep the promise already made to
-- everyone who has a profile today. Nobody's exposure changes when this ships;
-- it changes when they choose.
ALTER TABLE "JobProfile" ADD COLUMN "profileVisibility" TEXT NOT NULL DEFAULT 'private';
ALTER TABLE "JobProfile" ADD COLUMN "contactVisibility" TEXT NOT NULL DEFAULT 'private';
ALTER TABLE "JobProfile" ADD COLUMN "salaryVisibility" TEXT NOT NULL DEFAULT 'private';

ALTER TABLE "JobProfile" ADD COLUMN "sectionOrder" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- CARRY THE FREE TEXT ACROSS, and leave the old columns alone.
--
-- `education` has been a textarea, one degree per line, since the hub shipped.
-- Dropping it would lose data; ignoring it would leave every existing citizen
-- with an empty Education section next to a populated textarea. Each non-empty
-- line becomes an entry, marked source='cv' and confidence='medium' so the
-- review screen asks about it rather than asserting it. The old column stays
-- readable for one release.
INSERT INTO "CvEntry" ("id", "profileId", "kind", "order", "title", "confidence", "source", "updatedAt")
SELECT
    -- md5(), not gen_random_uuid(): the id column is TEXT, and gen_random_uuid
    -- needs pgcrypto on anything older than PG13. This works on every version
    -- and the column does not care that it is not a UUID.
    md5(p."id" || ':edu:' || line.ord::text),
    p."id",
    'education',
    (line.ord - 1)::int,
    btrim(line.value),
    'medium',
    'cv',
    CURRENT_TIMESTAMP
FROM "JobProfile" p,
     LATERAL unnest(string_to_array(p."education", E'\n')) WITH ORDINALITY AS line(value, ord)
WHERE btrim(line.value) <> '';

-- Same for links, one per line.
INSERT INTO "CvEntry" ("id", "profileId", "kind", "order", "title", "url", "confidence", "source", "updatedAt")
SELECT
    md5(p."id" || ':link:' || line.ord::text),
    p."id",
    'link',
    (line.ord - 1)::int,
    btrim(line.value),
    btrim(line.value),
    'high',
    'citizen',
    CURRENT_TIMESTAMP
FROM "JobProfile" p,
     LATERAL unnest(string_to_array(p."links", E'\n')) WITH ORDINALITY AS line(value, ord)
WHERE btrim(line.value) <> '';

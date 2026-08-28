-- THE TABLE, BEFORE THE TWO MIGRATIONS THAT ALTER IT.
--
-- `20260814020000_mail_project_look` adds `color` and `description` to
-- "MailProject", and `20260814030000_project_id_on` changes its `subAddress`
-- default. The migration that CREATES the table is
-- `20260814090000_mail_projects`, and 090000 sorts after both of them.
--
-- On the production database that never mattered: the table was already there
-- when those two ran, and 090000 is written entirely in `IF NOT EXISTS` for
-- exactly that reason. On an EMPTY database it is fatal, and an empty database
-- is what CI builds on every push:
--
--     ERROR: relation "MailProject" does not exist
--     Migration name: 20260814020000_mail_project_look
--
-- `prisma migrate deploy` stops at the first failure, so the three steps after
-- it — the type-check, the whole API suite, and the docs-are-current gate —
-- have been skipped, silently, on every push since 14 Aug. The web job passes,
-- so the pull request said "3 / 4" rather than something anybody would stop
-- for.
--
-- The fix is forward-only and this file is the whole of it. Renaming 090000 to
-- sort earlier would change the identity of a migration production has already
-- applied, and editing 020000 in place would change its checksum, which
-- `migrate deploy` refuses on the next production run. A NEW migration named
-- before them is applied on a fresh database in the right order and is a
-- complete no-op on any database that already has the table — which is every
-- database this has ever run on.
--
-- WHAT IS NOT HERE, deliberately: the foreign key. 090000 adds
-- `MailProject_ownerId_fkey` with a bare ADD CONSTRAINT, which has no
-- IF NOT EXISTS, so creating it here would make 090000 the migration that
-- fails instead. The table and its indexes are idempotent; the constraint
-- stays where it is and is still added exactly once.
--
-- Column definitions are copied verbatim from 090000 so the two cannot drift:
-- whichever one wins on a given database, the table is the same table.
CREATE TABLE IF NOT EXISTS "MailProject" (
    "id"         TEXT NOT NULL,
    "ownerId"    TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "key"        TEXT NOT NULL,
    "subAddress" BOOLEAN NOT NULL DEFAULT false,
    "archived"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailProject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailProject_ownerId_key_key"
    ON "MailProject" ("ownerId", "key");

CREATE INDEX IF NOT EXISTS "MailProject_ownerId_archived_createdAt_idx"
    ON "MailProject" ("ownerId", "archived", "createdAt");

-- PROJECT FOLDERS: rooms inside a mailbox.
--
-- A project files THREADS, and it files them for ONE citizen. It is not a
-- drawer mail leaves the inbox for: All Email keeps every row, and the scoped
-- mailbox is the same query with one more clause on it.
--
-- THE COLUMN IS ON THE MESSAGE AND THE UNIT IS THE THREAD, which is worth
-- stating because those two sentences look like a contradiction. There is no
-- MailThread table in this schema — a thread is a shared `threadId` across
-- rows — so the filing is denormalised onto every row of a trail. The
-- invariant is enforced in one place in the service (`fileThread`), which
-- moves every row of a thread at once. The alternative, a join table, puts a
-- growing `IN (…)` in front of the one query a mailbox runs on every screen.
ALTER TABLE "MailMessage" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

-- The scoped mailbox: one citizen, one project, one folder, newest first.
CREATE INDEX IF NOT EXISTS "MailMessage_ownerId_projectId_folder_createdAt_idx"
    ON "MailMessage" ("ownerId", "projectId", "folder", "createdAt");

CREATE TABLE IF NOT EXISTS "MailProject" (
    "id"         TEXT NOT NULL,
    "ownerId"    TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    -- Both the URL (/mail/p/<key>) and the optional sub-address, so it is
    -- unique per mailbox and lowercase by the time it arrives here.
    "key"        TEXT NOT NULL,
    "subAddress" BOOLEAN NOT NULL DEFAULT false,
    "archived"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailProject_pkey" PRIMARY KEY ("id")
);

-- Two projects called `abg` in one mailbox would make /mail/p/abg ambiguous
-- and you+abg@ undeliverable. The cap of fifty is the service's; this is the
-- one rule the database itself has to hold.
CREATE UNIQUE INDEX IF NOT EXISTS "MailProject_ownerId_key_key"
    ON "MailProject" ("ownerId", "key");

CREATE INDEX IF NOT EXISTS "MailProject_ownerId_archived_createdAt_idx"
    ON "MailProject" ("ownerId", "archived", "createdAt");

-- ON DELETE CASCADE takes the projects with the citizen. Their MAIL is not
-- touched by that: MailMessage.projectId has no foreign key on purpose, so a
-- vanished project can never take a message with it — the service clears the
-- column when a project is deleted, and a stale id would simply stop matching.
ALTER TABLE "MailProject"
    ADD CONSTRAINT "MailProject_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

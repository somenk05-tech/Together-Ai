-- Roles and an audit trail, before any console screen exists.
--
-- These two tables are built first on purpose. A dashboard can be added a
-- screen at a time; permissions and auditing cannot. Retrofitting them means
-- revisiting every action already written, and the one that gets missed is the
-- one nobody finds until it matters.
--
-- AdminGrant is a row rather than a column on User because who granted it, and
-- when, are part of the fact. A role sitting in a column has no author, and a
-- role with no author is one nobody can be asked about. Revoking sets
-- revokedAt rather than deleting: the history of who could do what, when, is
-- the only way to read an old audit entry correctly.
CREATE TABLE "AdminGrant" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "grantedBy" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "reason"    TEXT NOT NULL DEFAULT '',
  CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminGrant_userId_revokedAt_idx" ON "AdminGrant"("userId", "revokedAt");
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- before/after hold the field that moved, not the whole row: a diff somebody
-- can read beats a dump nobody opens, and a whole-row copy of a citizen's
-- record duplicates their data into a table with different access rules.
CREATE TABLE "AdminAudit" (
  "id"       TEXT NOT NULL,
  "actorId"  TEXT NOT NULL,
  "action"   TEXT NOT NULL,
  "entity"   TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "before"   TEXT,
  "after"    TEXT,
  "reason"   TEXT NOT NULL DEFAULT '',
  "ip"       TEXT,
  "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminAudit_entity_entityId_idx" ON "AdminAudit"("entity", "entityId");
CREATE INDEX "AdminAudit_actorId_at_idx" ON "AdminAudit"("actorId", "at");
CREATE INDEX "AdminAudit_at_idx" ON "AdminAudit"("at");
ALTER TABLE "AdminAudit" ADD CONSTRAINT "AdminAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

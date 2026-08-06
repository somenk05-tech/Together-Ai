-- Kill switches, one row per hub, created only when somebody flips one.
--
-- No seed. MISSING MEANS ON is the rule the guard reads, and seeding every key
-- as enabled would make a failed seed an outage and make "has anybody ever
-- turned this off" unanswerable from the table.
--
-- The key is not constrained here. The fixed list lives in
-- src/dev/feature-flags.ts, which is what the guard actually reads; a CHECK
-- constraint would need a migration every time a hub is added and would drift
-- from that list the first time somebody forgot.
CREATE TABLE IF NOT EXISTS "FeatureFlag" (
  "key"       TEXT PRIMARY KEY,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "note"      TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT NOT NULL DEFAULT ''
);

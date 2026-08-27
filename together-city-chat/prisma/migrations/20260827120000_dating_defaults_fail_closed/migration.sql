-- Dating profiles default to OUT of the pool, not in it.
--
-- Launch audit, 27 Aug: "moderation" defaulted to 'approved' and "visible" to
-- true, so a row created by any path that did not set them was live the moment
-- it existed — including for the duration of the AI moderation call that was
-- supposed to decide whether it should be. That is how an under-18 profile
-- reached other citizens' lists before the check that rejects it had run.
--
-- Only the DEFAULTS change. No existing row is touched: a profile approved
-- today stays approved, and one that is visible stays visible. This governs
-- what happens next, not what already happened.
ALTER TABLE "DatingProfile" ALTER COLUMN "moderation" SET DEFAULT 'pending';
ALTER TABLE "DatingProfile" ALTER COLUMN "visible" SET DEFAULT false;

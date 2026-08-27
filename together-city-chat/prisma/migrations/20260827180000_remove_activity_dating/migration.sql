-- Activity Dating removed entirely (owner, 27 Aug).
--
-- The feature — a host posts a plan, the engine auto-invites compatible people,
-- they accept into an anonymous chat and climb "trust levels" — was the root of
-- a launch-audit blocker (its chats surfaced in the main Chats list under the
-- other person's real name) and two harassment vectors (invitations ignored
-- passes and could not be declined short of a block). Neither model has a
-- foreign-key relation, so both tables drop cleanly.
--
-- The chats these ever opened are ordinary DIRECT conversations and are left
-- alone; only the activity/invite bookkeeping goes.
DROP TABLE IF EXISTS "ActivityInvite";
DROP TABLE IF EXISTS "DatingActivity";

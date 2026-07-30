-- Retire every outstanding email-verification link.
--
-- The 24-hour link flow is replaced by six-digit codes. Deleting the endpoints
-- without doing this would leave live tokens in circulation for another day —
-- and those particular tokens should not have been circulating at all.
--
-- The link used to be dispatched through MailService.deliverSystem, which files
-- a copy of the message in the citizen's IN-APP Together City inbox as well as
-- emailing it. So the link that proves control of an external mailbox was
-- sitting somewhere any holder of a session could read. Anyone signed in could
-- verify an address they had no access to, which means "verified email" did not
-- mean what the rest of the app assumed it meant.
--
-- Marking them consumed rather than deleting the rows: the retention sweep in
-- tasks/retention.service.ts already clears spent tokens on its own schedule,
-- and an audit trail that a token existed is worth more than the row is worth
-- reclaiming.
UPDATE "VerificationToken"
SET "usedAt" = NOW()
WHERE "usedAt" IS NULL
  AND "purpose" = 'email_verification';

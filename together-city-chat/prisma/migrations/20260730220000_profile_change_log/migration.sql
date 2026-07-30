-- Who changed what, when (§3 BE-3.1; §16 BE-16.1 asks for the same trail).
--
-- The Master Profile holds health data — height, weight, sex at birth, date of
-- birth — and nine services write to it through syncShared(). Until now the
-- only record that a value had changed was a log line, which is not a record.
--
-- One row per FIELD rather than per request, because the question this exists
-- to answer is "when did my weight change and what did it come from", not "what
-- did request 41a2 contain".

CREATE TABLE "ProfileChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    -- Rendered as text: these columns hold ints, dates and strings, and a JSON
    -- blob would make "show me every change to weightKg" a scan.
    "oldValue" TEXT,
    "newValue" TEXT,
    -- Which surface did the writing: 'master-profile-page', 'nutrition',
    -- 'dating', 'jobs', 'fitness', 'astrology', 'beauty', 'social'.
    "source" TEXT NOT NULL,
    -- Normally the citizen themself. Set differently when a household owner
    -- edits a dependent's record, which §12 introduces — the column exists now
    -- so that history is answerable from the first day it can happen.
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileChange_pkey" PRIMARY KEY ("id")
);

-- The query this table is for: one citizen's history, newest first.
CREATE INDEX "ProfileChange_userId_changedAt_idx" ON "ProfileChange"("userId", "changedAt");
-- And the narrower one: the history of a single field.
CREATE INDEX "ProfileChange_userId_field_changedAt_idx" ON "ProfileChange"("userId", "field", "changedAt");

ALTER TABLE "ProfileChange"
  ADD CONSTRAINT "ProfileChange_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Optimistic concurrency for the profile itself. Two tabs open on the same
-- profile currently means last-write-wins with no sign anything was lost.
ALTER TABLE "MasterProfile" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

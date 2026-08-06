-- A job profile a person would actually show somebody.
--
-- resumeUrl is the important one. Until now only the TEXT pulled out of a CV
-- was kept, so a citizen could upload their document, watch the app read it,
-- and then have no way to see, download or replace the file they had given it.
-- The bytes are theirs; keeping only our extraction of them was the bug.
--
-- summary is written by the reader and then edited by the citizen. A synopsis
-- of somebody's career is a claim they have to stand behind, so it is never
-- published unread -- the same propose-then-confirm split the menu reader uses.
ALTER TABLE "JobProfile" ADD COLUMN "resumeUrl" TEXT;
ALTER TABLE "JobProfile" ADD COLUMN "resumeBytes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "JobProfile" ADD COLUMN "resumeAt" TIMESTAMP(3);
ALTER TABLE "JobProfile" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "JobProfile" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "currentTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "currentCompany" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "education" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "openToRoles" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobProfile" ADD COLUMN "noticeDays" INTEGER;
ALTER TABLE "JobProfile" ADD COLUMN "expectedLpa" INTEGER;
ALTER TABLE "JobProfile" ADD COLUMN "links" TEXT NOT NULL DEFAULT '';

-- What Mira knows about the citizen, as opposed to what they said.
--
-- Additive: one new table, no column dropped and no existing row touched, so a
-- deploy that applies this and then rolls back loses only the facts written in
-- between. `MiraTurn` is untouched.
CREATE TABLE "MiraFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'possible',
    "sourceText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiraFact_pkey" PRIMARY KEY ("id")
);

-- One fact per subject per citizen: a second mention updates rather than
-- appending, or the profile fills with the same thing said six ways.
CREATE UNIQUE INDEX "MiraFact_userId_subject_key" ON "MiraFact"("userId", "subject");
CREATE INDEX "MiraFact_userId_updatedAt_idx" ON "MiraFact"("userId", "updatedAt");

ALTER TABLE "MiraFact" ADD CONSTRAINT "MiraFact_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── MEDICAL MAIL (owner, 16 Sep) ─────────────────────────────────────────────
-- A permanent medical address for every citizen, the emails that arrive on it,
-- the attachments filed from them into the health vault, the citizen's sender
-- rules, the hints on ordinary mail, the health timeline and the audit trail.
-- Seven new tables; nothing existing altered. Mailboxes are created lazily by
-- the API (first Medical Hub visit or first inbound), then backfilled below
-- for every existing citizen so an address exists before anyone opens the page.

CREATE TABLE "MedicalMailbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "processDocuments" BOOLEAN NOT NULL DEFAULT true,
    "aiAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "autoLink" BOOLEAN NOT NULL DEFAULT true,
    "classifyEmails" BOOLEAN NOT NULL DEFAULT true,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MedicalMailbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MedicalMailbox_userId_key" ON "MedicalMailbox"("userId");
CREATE UNIQUE INDEX "MedicalMailbox_address_key" ON "MedicalMailbox"("address");

CREATE TABLE "MedicalEmail" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "providerEmailId" TEXT,
    "threadId" TEXT,
    "fromAddr" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "toAddr" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "snippet" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "classification" TEXT NOT NULL DEFAULT 'unknown',
    "category" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classificationReason" TEXT NOT NULL DEFAULT '',
    "authenticated" BOOLEAN,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalEmail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MedicalEmail_userId_receivedAt_idx" ON "MedicalEmail"("userId", "receivedAt");
CREATE INDEX "MedicalEmail_userId_externalMessageId_idx" ON "MedicalEmail"("userId", "externalMessageId");
CREATE INDEX "MedicalEmail_userId_archivedAt_deletedAt_receivedAt_idx" ON "MedicalEmail"("userId", "archivedAt", "deletedAt", "receivedAt");
CREATE INDEX "MedicalEmail_userId_category_receivedAt_idx" ON "MedicalEmail"("userId", "category", "receivedAt");
CREATE INDEX "MedicalEmail_userId_readAt_idx" ON "MedicalEmail"("userId", "readAt");

CREATE TABLE "MedicalEmailAttachment" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT,
    "recordId" TEXT,
    "documentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MedicalEmailAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MedicalEmailAttachment_userId_sha256_idx" ON "MedicalEmailAttachment"("userId", "sha256");
CREATE INDEX "MedicalEmailAttachment_userId_recordId_idx" ON "MedicalEmailAttachment"("userId", "recordId");
CREATE INDEX "MedicalEmailAttachment_emailId_idx" ON "MedicalEmailAttachment"("emailId");
CREATE INDEX "MedicalEmailAttachment_userId_status_idx" ON "MedicalEmailAttachment"("userId", "status");
ALTER TABLE "MedicalEmailAttachment" ADD CONSTRAINT "MedicalEmailAttachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "MedicalEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MedicalSenderRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalSenderRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MedicalSenderRule_userId_pattern_key" ON "MedicalSenderRule"("userId", "pattern");
CREATE INDEX "MedicalSenderRule_userId_idx" ON "MedicalSenderRule"("userId");

CREATE TABLE "MedicalMailHint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mailMessageId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalMailHint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MedicalMailHint_mailMessageId_key" ON "MedicalMailHint"("mailMessageId");
CREATE INDEX "MedicalMailHint_userId_idx" ON "MedicalMailHint"("userId");

CREATE TABLE "MedicalTimelineEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordId" TEXT,
    "emailId" TEXT,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalTimelineEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MedicalTimelineEvent_userId_eventDate_idx" ON "MedicalTimelineEvent"("userId", "eventDate");
CREATE INDEX "MedicalTimelineEvent_userId_recordId_idx" ON "MedicalTimelineEvent"("userId", "recordId");

CREATE TABLE "MedicalAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MedicalAuditEvent_userId_at_idx" ON "MedicalAuditEvent"("userId", "at");
CREATE INDEX "MedicalAuditEvent_subject_subjectId_idx" ON "MedicalAuditEvent"("subject", "subjectId");

-- Every existing citizen gets an address now, so a doctor can be handed it
-- before the citizen has ever opened the Medical Hub. The token is 20 hex
-- characters of randomness, lower-case; the API mints the same shape. md5 of
-- two random sources rather than pgcrypto, which Railway's Postgres may not
-- have enabled; it is an address token, not a key.
INSERT INTO "MedicalMailbox" ("id", "userId", "address", "updatedAt")
SELECT gen_random_uuid()::text, u."id",
       'medical.' || substr(md5(random()::text || clock_timestamp()::text || u."id"), 1, 20) || '@togethercity.app',
       CURRENT_TIMESTAMP
FROM "User" u
WHERE u."deletedAt" IS NULL
ON CONFLICT DO NOTHING;

-- Makeup look analyses, avatars, and call sessions.
--
-- Purely additive: four new tables, their indexes and foreign keys. Nothing
-- existing is altered, so this cannot touch a row of citizen data.
--
-- CallParticipant(callId, userId) is unique: joining a call twice from two tabs
-- must not create two participant rows, because "who is in this call" is then
-- ambiguous and the leave path would only close one of them.

-- CreateTable
CREATE TABLE "LookAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileKey" TEXT,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "readBy" TEXT NOT NULL DEFAULT 'fallback',
    "attributes" TEXT,
    "steps" TEXT,
    "productMatches" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputs" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerJobId" TEXT,
    "assetKey" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'audio',
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "avatarId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "role" TEXT NOT NULL DEFAULT 'callee',

    CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LookAnalysis_userId_createdAt_idx" ON "LookAnalysis"("userId", "createdAt");
CREATE INDEX "Avatar_userId_createdAt_idx" ON "Avatar"("userId", "createdAt");
CREATE INDEX "Avatar_userId_isSelected_idx" ON "Avatar"("userId", "isSelected");
CREATE INDEX "CallSession_conversationId_createdAt_idx" ON "CallSession"("conversationId", "createdAt");
CREATE INDEX "CallSession_status_idx" ON "CallSession"("status");
CREATE INDEX "CallParticipant_userId_idx" ON "CallParticipant"("userId");
CREATE UNIQUE INDEX "CallParticipant_callId_userId_key" ON "CallParticipant"("callId", "userId");

-- AddForeignKey
ALTER TABLE "LookAnalysis" ADD CONSTRAINT "LookAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AN ADDRESS THIS CITY HAS BEEN TOLD TO STOP WRITING TO.
--
-- There was no suppression list and no delivery feedback of any kind: the
-- inbound webhook normalised `email.received` and nothing else, and
-- EmailDelivery.status was written once at create and never updated, so every
-- Resend send sat at 'queued' for ever. A hard bounce was re-sent on the next
-- resend; a spam complaint suppressed nothing. Both are how a sending domain is
-- lost, and this one carries every OTP the city sends.
CREATE TABLE "SuppressedAddress" (
  "address"   TEXT NOT NULL,
  "reason"    TEXT NOT NULL,
  "detail"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SuppressedAddress_pkey" PRIMARY KEY ("address")
);

CREATE INDEX "SuppressedAddress_reason_createdAt_idx" ON "SuppressedAddress"("reason", "createdAt");

-- The delivery webhook knows only the provider's id for the message.
CREATE INDEX "EmailDelivery_providerMessageId_idx" ON "EmailDelivery"("providerMessageId");

-- AND THE INDEXES EVERY THREAD OPERATION WAS MISSING.
--
-- MailMessage had (ownerId, folder, createdAt) and (ownerId, projectId, folder,
-- createdAt) and nothing on (ownerId, threadId) — which is what resolveThreadId,
-- thread(), fileThread, fileWholeThread, threadProject, threadAttachments,
-- attachmentUrl and resolveInboundThread all filter on. That is the hot path of
-- every message opened and every mail that arrives.
CREATE INDEX "MailMessage_ownerId_threadId_idx" ON "MailMessage"("ownerId", "threadId");
CREATE INDEX "MailMessage_ownerId_providerMessageId_idx" ON "MailMessage"("ownerId", "providerMessageId");
CREATE INDEX "MailMessage_ownerId_starred_idx" ON "MailMessage"("ownerId", "starred");

-- The socket layer orders every reconnecting client's room list by
-- conversation.updatedAt and there was no index behind it.
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- ── SEARCH, IF THIS DATABASE WILL HAVE IT ──────────────────────────────────
--
-- Message search and mail search are both `ILIKE '%…%'` across everything the
-- citizen can see, with no index behind either. A trigram GIN index is the fix,
-- and it needs an extension.
--
-- THIS BLOCK CANNOT FAIL A DEPLOY, and that is the whole reason it is written
-- as a DO block rather than three plain statements. `CREATE EXTENSION` needs a
-- privilege a managed Postgres role may not have; a migration that raises there
-- takes the entire deploy with it, for a performance index. So: try to install
-- it, swallow the refusal, and create the indexes only if the extension is
-- actually present afterwards. On a database that allows it, search gets an
-- index. On one that does not, nothing happens and nothing breaks — check with
--   SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
-- and, if it is absent, install it by hand as a superuser and re-run this file.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm could not be installed (%). Search stays unindexed; nothing else is affected.', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Message_text_trgm_idx" ON "Message" USING gin ("text" gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "MailMessage_subject_trgm_idx" ON "MailMessage" USING gin ("subject" gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "MailMessage_body_trgm_idx" ON "MailMessage" USING gin ("body" gin_trgm_ops)';
  END IF;
END
$$;

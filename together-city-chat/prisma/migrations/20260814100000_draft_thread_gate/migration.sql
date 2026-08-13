-- A DRAFT THAT CLAIMS A THREAD ITS OWNER IS NOT IN LOSES THE CLAIM.
--
-- `saveDraft` wrote the request's `threadId` verbatim, with no check that the
-- writer held any message in that thread. Thread membership is what
-- `threadAttachments` and `attachmentUrl` accept as proof somebody belongs in
-- a conversation, and neither filters by folder — so a draft was as good as a
-- message, and a draft costs nothing to make. Two requests got a stranger a
-- signed download URL for another citizen's Drive file.
--
-- The gate is closed in the service as of this commit. This clears anything
-- that got through before it, because a row written under the old rule keeps
-- working under the new one otherwise.
--
-- THE CONDITION IS "HOLDS NO NON-DRAFT ROW IN THAT THREAD". A legitimate
-- reply-draft was started from a message the citizen has — the original is in
-- their own inbox or sent. A draft whose thread contains nothing of theirs but
-- other drafts is either a forgery or a reply to a message they have since
-- deleted; both should start a fresh trail, and neither loses a word of what
-- was typed. Only the claim is dropped.
UPDATE "MailMessage" d
   SET "threadId" = NULL
 WHERE d.folder = 'draft'
   AND d."threadId" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM "MailMessage" m
      WHERE m."ownerId" = d."ownerId"
        AND m."threadId" = d."threadId"
        AND m.folder <> 'draft'
   );

-- A reader's choice to see a conversation as unread again. Separate from
-- lastReadAt, which is a high-water mark that never moves backwards by design.
ALTER TABLE "ConversationMember" ADD COLUMN "markedUnread" BOOLEAN NOT NULL DEFAULT false;

-- ConversationMember.clearedAt — per-participant chat deletion.
--
-- Purely additive: one nullable column on an existing table. No default, no
-- backfill, no rewrite. Every existing membership reads NULL, which means
-- "nothing cleared" — the behaviour every citizen has today.
--
-- Deliberately a timestamp rather than a boolean. Deleting a chat has to
-- survive the chat coming back: if the other person writes again the thread
-- must reappear carrying only the new messages, which a flag cannot express
-- but an instant can.

-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN "clearedAt" TIMESTAMP(3);

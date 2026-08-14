-- A star is the READER's bookkeeping about a message, not a fact about the
-- message: two citizens can keep the same row and neither sees the other's.
-- Nullable rather than defaulted to '[]' so nothing has to be rewritten for
-- rows that predate it — absent and empty mean the same thing to the reader.
ALTER TABLE "Message" ADD COLUMN "starredForJson" TEXT;

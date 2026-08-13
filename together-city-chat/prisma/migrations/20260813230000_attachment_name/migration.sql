-- The original filename of a chat attachment.
--
-- Storage keys are uuid-based, which is right for storage and useless to a
-- recipient: "9f2c1e0a-….pdf" tells them nothing about what they were sent.
-- Nullable, because every attachment that predates this column has no name to
-- recover, and a voice note never had one.
ALTER TABLE "Attachment" ADD COLUMN "name" TEXT;

-- Cc and Bcc.
--
-- Two columns, and the difference between them is the entire feature.
--
-- ccAddrs is on every copy: being openly copied is a fact all recipients
-- share, and hiding it from them would make Cc mean Bcc.
--
-- bccAddrs is written ONLY to the sender's own Sent row. A recipient's copy
-- that carried it would tell every reader exactly who was blind-copied, which
-- is the one thing Bcc exists to prevent. That rule lives in code and in
-- mail-cc-bcc.spec.ts rather than in this column's type, because the database
-- cannot express "null on every row except one".
ALTER TABLE "MailMessage" ADD COLUMN "ccAddrs" TEXT;
ALTER TABLE "MailMessage" ADD COLUMN "bccAddrs" TEXT;

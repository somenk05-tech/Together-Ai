-- A SEND IS NOT TWO MESSAGES.
--
-- `clientId` has been in the send DTO since it was written, described there as
-- "client-generated id for optimistic UI / idempotency". It was read in exactly
-- one place — the socket ack echoed it back — and never stored, so nothing was
-- idempotent: a POST retried after a timeout, or a socket re-sending what it
-- was not sure had landed, wrote a second row.
--
-- Nullable, and the unique index is over (senderId, clientId). Postgres treats
-- NULLs as distinct in a unique index, so every send that carries no client id
-- is unaffected. Scoped to the sender because a client id is generated on a
-- device and two devices may pick the same string.
ALTER TABLE "Message" ADD COLUMN "clientId" TEXT;

CREATE UNIQUE INDEX "Message_senderId_clientId_key" ON "Message"("senderId", "clientId");

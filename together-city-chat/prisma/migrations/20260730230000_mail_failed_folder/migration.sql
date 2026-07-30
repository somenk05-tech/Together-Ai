-- Sent used to mean "we tried".
--
-- sendExternal() wrote the Sent copy BEFORE dispatching and never removed it
-- when the provider refused the message, so a failed send left the sender with
-- an error on screen and a copy in Sent saying it had gone. During the
-- delivery outage earlier this week every one of those rejections did exactly
-- that. Sent now means accepted; a rejected message goes to `failed` with the
-- reason attached.
ALTER TABLE "MailMessage" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "MailMessage" ADD COLUMN "providerMessageId" TEXT;
-- Kept only on failed rows, so Retry can re-attach the same files. Without it a
-- retry went out without the attachments: the message looked sent and arrived
-- incomplete, which is a worse failure than the one being retried.
ALTER TABLE "MailMessage" ADD COLUMN "attachmentIds" TEXT;

-- Existing rows are NOT reclassified. We cannot tell, after the fact, which of
-- them the provider accepted — EmailDelivery has the answer for some and not
-- all, and guessing would replace one wrong claim with another. They stay in
-- Sent, and everything from here is truthful.

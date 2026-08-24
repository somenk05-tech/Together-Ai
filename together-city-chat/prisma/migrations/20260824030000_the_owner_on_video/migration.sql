-- THE OWNER, ON VIDEO — a short clip of themselves at the business, watched
-- by a person, exactly like the document. Additive; every existing row is
-- 'none', which is the truth about it.
ALTER TABLE "ServiceVerification" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "ServiceVerification" ADD COLUMN "videoStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "ServiceVerification" ADD COLUMN "videoSubmittedAt" TIMESTAMP(3);
ALTER TABLE "ServiceVerification" ADD COLUMN "videoDecidedAt" TIMESTAMP(3);
ALTER TABLE "ServiceVerification" ADD COLUMN "videoDecidedBy" TEXT;
ALTER TABLE "ServiceVerification" ADD COLUMN "videoRejectReason" TEXT;

-- One free photo analysis per rolling 30 days, then ₹100 each (owner decision,
-- 5 Sep). The price is read from the analyses that PRODUCED A RESULT, which is
-- a different list from analysisLogJson: that one counts every run including
-- rejected photographs, and exists to stop a script rather than price a
-- person. A rejected read costs the citizen nothing and must not spend the
-- free one, so it is not on this list.
ALTER TABLE "BeautyProfile" ADD COLUMN "acceptedAnalysesJson" TEXT;

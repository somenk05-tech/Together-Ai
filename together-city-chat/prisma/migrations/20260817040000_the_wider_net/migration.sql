-- THE WIDER NET.
--
-- One additive column. Adzuna states real salary figures for some Indian
-- postings (and flags its predictions, which are refused at ingest); the ATS
-- boards almost never state one. 0 keeps meaning what it meant everywhere in
-- this hub: "the source did not say", which the card renders as silence, not
-- as ₹0.
--
-- Additive and nothing backfilled: a rollback leaves every row as it was.
ALTER TABLE "ExternalJob" ADD COLUMN "salaryLpa" INTEGER NOT NULL DEFAULT 0;

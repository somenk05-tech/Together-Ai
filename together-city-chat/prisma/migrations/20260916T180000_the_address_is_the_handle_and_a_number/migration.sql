-- ── THE ADDRESS IS THE HANDLE AND A NUMBER (owner, 16 Sep) ───────────────────
-- "like medical.username1234@togethercity.app". The first migration minted
-- medical.<20 hex>@; every address becomes medical.<handle><4 digits>@ — the
-- handle a doctor can read back, four digits only the citizen knows. Rows
-- that already have the shape are left alone. Nothing else changes.
UPDATE "MedicalMailbox" m
SET "address" = 'medical.' || lower(u."handle") || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0') || '@togethercity.app',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "User" u
WHERE u."id" = m."userId"
  AND m."address" !~ ('^medical\.' || regexp_replace(lower(u."handle"), '([.\\])', '\\\1', 'g') || '[0-9]{4}@togethercity\.app$');

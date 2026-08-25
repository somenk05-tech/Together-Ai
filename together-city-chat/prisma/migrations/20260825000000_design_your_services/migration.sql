-- DESIGN YOUR SERVICES — the hubs a citizen switched off, as a JSON array of
-- hub keys. Nullable on purpose: null means the citizen has never designed,
-- which reads as the whole city. See src/profile/design-your-services.ts.
ALTER TABLE "User" ADD COLUMN "hiddenHubsJson" TEXT;

-- ── THE BILL AND THE CLOCK (owner, 16 Sep) ─────────────────────────────────
--
-- What the investor dashboard still called "not measured":
--   AiCall      one row per AI provider call: model, tokens, time, failure.
--               (Written 9 Sep as "what one citizen cost us"; landed today.)
--   UsageDay    seconds in the app per member per city day, from a heartbeat.
--   AppSession  one row per opening of the app, and whether it crashed.
--   ServerRun   one row per API process, with a beat a minute: uptime.
-- New tables only; nothing existing changes shape. None has a foreign key to
-- "User": these are the city's own accounts and must outlive an account.
-- Then the days members were here before 16 Sep are rebuilt from what already
-- records a day: sign-ins, messages, posts, comments, likes, calls, events.

CREATE TABLE "AiCall" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT,
  "model"      TEXT NOT NULL,
  "kind"       TEXT NOT NULL,
  "tokensIn"   INTEGER NOT NULL DEFAULT 0,
  "tokensOut"  INTEGER NOT NULL DEFAULT 0,
  "cacheRead"  INTEGER NOT NULL DEFAULT 0,
  "cacheWrite" INTEGER NOT NULL DEFAULT 0,
  "paid"       BOOLEAN NOT NULL DEFAULT false,
  "ms"         INTEGER,
  "failed"     BOOLEAN NOT NULL DEFAULT false,
  "error"      TEXT,
  "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiCall_userId_at_idx" ON "AiCall"("userId", "at");
CREATE INDEX "AiCall_at_idx" ON "AiCall"("at");

CREATE TABLE "UsageDay" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "day"       TEXT NOT NULL,
  "seconds"   INTEGER NOT NULL DEFAULT 0,
  "beats"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UsageDay_userId_day_key" ON "UsageDay"("userId", "day");
CREATE INDEX "UsageDay_day_idx" ON "UsageDay"("day");

CREATE TABLE "AppSession" (
  "id"        TEXT NOT NULL,
  "platform"  TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "crashes"   INTEGER NOT NULL DEFAULT 0,
  "crashKind" TEXT,
  "crashedAt" TIMESTAMP(3),
  CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppSession_startedAt_idx" ON "AppSession"("startedAt");

CREATE TABLE "ServerRun" (
  "id"         TEXT NOT NULL,
  "role"       TEXT NOT NULL,
  "commit"     TEXT,
  "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastBeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServerRun_lastBeatAt_idx" ON "ServerRun"("lastBeatAt");

-- Earlier days of use. Each source below already stores WHO and WHEN; only
-- the (member, city day) pair is copied, never what was said or posted. The
-- rows keep today's "firstAt", which is how the dashboard tells rebuilt days
-- (before go-live) from days recorded as they happened.
INSERT INTO "MemberDay" ("userId", "day")
SELECT DISTINCT a.uid, to_char((a.at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')
  FROM (
    SELECT "id" AS uid, "createdAt" AS at FROM "User"
    UNION ALL SELECT "userId", "createdAt" FROM "RefreshToken"
    UNION ALL SELECT "userId", "lastUsedAt" FROM "RefreshToken"
    UNION ALL SELECT "senderId", "createdAt" FROM "Message"
    UNION ALL SELECT "authorId", "createdAt" FROM "Post"
    UNION ALL SELECT "authorId", "createdAt" FROM "Comment"
    UNION ALL SELECT "userId", "createdAt" FROM "Like"
    UNION ALL SELECT "createdById", "createdAt" FROM "CallSession"
    UNION ALL SELECT "userId", "at" FROM "AppEvent" WHERE "userId" IS NOT NULL
  ) a
 WHERE a.uid IS NOT NULL AND a.at IS NOT NULL
   AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = a.uid AND u."deletedAt" IS NULL)
ON CONFLICT DO NOTHING;

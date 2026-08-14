-- Her memory: both sides of every exchange, per citizen, per room. The
-- forget command deletes from this table — the only write Mira performs
-- anywhere — and account deletion cascades through it.
CREATE TABLE "MiraTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraTurn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MiraTurn_userId_room_createdAt_idx" ON "MiraTurn"("userId", "room", "createdAt");

ALTER TABLE "MiraTurn" ADD CONSTRAINT "MiraTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

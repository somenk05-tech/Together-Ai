-- A saved post was a localStorage snapshot carrying a one-hour signed media
-- URL, so every saved photograph was broken by the time anybody came back for
-- it, and the list lived on one device. A bookmark is a pointer; the post is
-- re-read through the feed's own gates when the Saved page asks for it.
CREATE TABLE "Bookmark" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "postId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bookmark_userId_postId_key" ON "Bookmark"("userId", "postId");
CREATE INDEX "Bookmark_userId_createdAt_id_idx" ON "Bookmark"("userId", "createdAt" DESC, "id" DESC);

ALTER TABLE "Bookmark"
  ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark"
  ADD CONSTRAINT "Bookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

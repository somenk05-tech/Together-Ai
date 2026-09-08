-- A shelf that knows how old the child is (owner, 8 Sep). The Baby Care
-- district's only record: a name, an optional birthday, and the parent's own
-- notes, which nothing reads. The AGE IS NEVER STORED — it is derived from
-- "dob" every time it is asked for, because a stored age is wrong the morning
-- after it is written and this district's whole promise is a shelf that moves
-- with the child.
--
-- Shipped in the same commit as the code that reads it. (Production incident,
-- 8 Sep: /profile/me returned 500 for a day because a schema change and its
-- migration were left behind by the code that read them.)
CREATE TABLE "Child" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "dob"       TEXT,
  "notes"     TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- Every query in the service is scoped by userId, and a household is a handful
-- of rows in a table that will hold millions.
CREATE INDEX "Child_userId_idx" ON "Child"("userId");

ALTER TABLE "Child" ADD CONSTRAINT "Child_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

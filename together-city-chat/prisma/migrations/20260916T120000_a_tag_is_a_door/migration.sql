-- ── A TAG IS A DOOR (owner, 16 Sep) ─────────────────────────────────────────
-- "Add tags for Together City social life."
--
-- One new table, nothing altered. One row per #tag per post, so a tag's page
-- and the popular-tags list read an index rather than every caption. The
-- post's own createdAt is copied in so both reads use the one index.
CREATE TABLE "PostTag" (
    "postId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostTag_pkey" PRIMARY KEY ("postId","tag")
);

CREATE INDEX "PostTag_tag_createdAt_idx" ON "PostTag"("tag", "createdAt" DESC);

ALTER TABLE "PostTag" ADD CONSTRAINT "PostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The captions already written carry tags too: the composer has appended
-- them since August. The same reading as social/tags.ts, character for
-- character (TAG_LEAD and TAG_CHAR there; \u{...} there is \U000... here):
-- a '#' after the start, a space or an opening mark, then up to fifty
-- characters that are not spaces, punctuation or emoji; all-digit tags left
-- alone; lower-case. At most twenty per post, like a new post.
INSERT INTO "PostTag" ("postId", "tag", "createdAt")
SELECT "postId", "tag", "createdAt" FROM (
    SELECT t."postId", t."tag", t."createdAt",
           ROW_NUMBER() OVER (PARTITION BY t."postId" ORDER BY t."first") AS n
    FROM (
        SELECT p."id" AS "postId", lower(m.hit[2]) AS "tag", p."createdAt", MIN(m.ord) AS "first"
        FROM "Post" p
        CROSS JOIN LATERAL regexp_matches(p."text", '(^|[\s(\[{"''\u201C\u2018\u00AB,;:!?\u00A1\u00BF\u2014\u2013-])#([^\s!-/:-@\[-^`{-~\u00A0-\u00BF\u00D7\u00F7\u2000-\u206F\u2190-\u2BFF\u3000-\u303F\uFE00-\uFE0F\uFF00-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\U0001F000-\U0001FAFF]{1,50})(?![^\s!-/:-@\[-^`{-~\u00A0-\u00BF\u00D7\u00F7\u2000-\u206F\u2190-\u2BFF\u3000-\u303F\uFE00-\uFE0F\uFF00-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\U0001F000-\U0001FAFF])', 'g')
            WITH ORDINALITY AS m(hit, ord)
        WHERE p."text" IS NOT NULL
        GROUP BY p."id", lower(m.hit[2]), p."createdAt"
    ) t
    WHERE t."tag" !~ '^[0-9]+$'
) ranked
WHERE n <= 20
ON CONFLICT DO NOTHING;

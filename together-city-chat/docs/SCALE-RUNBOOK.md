# The scale runbook

What has to be true outside this repository for the code in it to serve a
million daily citizens. Everything here is a deployment action; the code side of
each item is already landed and linked.

---

## 1 · A transaction-mode pooler in front of Postgres

**The single cheapest capacity change available, and nothing in this repository
can do it.**

`shared/prisma/prisma.service.ts` opens `DB_POOL_MAX` connections per container,
default 20, with `connectionTimeoutMillis: 5000`. That is five containers
against a stock `max_connections = 100` with room to spare, and it is the right
default with no pooler in front. It is also a hard wall: two API containers is
forty connections for ten thousand concurrent citizens, and the failure mode is
not slowness, it is a wall of 500s the moment the pool is busy.

The file's own docblock has said the answer since it was written, and the answer
has not been done:

> PAST A FEW HUNDRED CONCURRENT CITIZENS THAT ARITHMETIC RUNS OUT, and the
> answer is not a bigger number here: it is a transaction-mode pooler.

**Do this:** put pgBouncer (or the managed platform's own pooler) in transaction
mode between the containers and Postgres, point `DATABASE_URL` at it, then raise
`DB_POOL_MAX` to 50–100 per container.

**No code change is needed.** `@prisma/adapter-pg` caches prepared statements
only when a `statementNameGenerator` is supplied and this deployment supplies
none, so there are no server-side named statements to survive a transaction
boundary — which is the thing that breaks Prisma behind pgBouncer. No
`?pgbouncer=true`, nothing to edit.

**How you will know it worked:** `SELECT count(*) FROM pg_stat_activity WHERE
application_name = 'together-city-api'` stops tracking container count × 20 and
starts tracking the pooler's own small number.

---

## 2 · A worker service, and `JOBS_ROLE=api` on the API

Full instructions: `docs/WORKER-SERVICE.md`. In one paragraph: `libx264` holds a
vCPU for as long as the video is long and the owner allows an hour of it, so the
encode is now on a `media` lane that only a `JOBS_ROLE=worker` container
consumes. Deploy the worker first, then set `JOBS_ROLE=api` on the API — between
the two the API is still `both`, so there is no window with nothing consuming.

---

## 3 · The indexes, built `CONCURRENTLY`

Three migrations land indexes on the six biggest tables in the city:

| Migration | Tables |
|---|---|
| `20260906T160000_an_index_behind_every_delete` | Bookmark, Comment, Message, User ×2 |
| `20260906T170000_a_worker_of_its_own` | PostMedia (partial) |
| `20260906T190000_the_four_reads_a_million_makes` | User ×4 (two partial, one trigram, one pattern-ops) |

`prisma migrate deploy` wraps each migration in a transaction, and
`CREATE INDEX CONCURRENTLY` cannot run inside one — so on a database with real
data in it a plain `CREATE INDEX` takes a SHARE lock and blocks every write to
that table for the length of the build. On `Message` and `User` that is the whole
city.

**Do this, against production, before the deploy that carries these migrations:**
run each `CREATE INDEX CONCURRENTLY` statement by hand — every one of them is
written out in a comment at the top of its own migration file — then

```
npx prisma migrate resolve --applied <migration_name>
```

for each. Every statement is `IF NOT EXISTS`, so if you forget, the migration
finds the index already there and does nothing; the only cost of getting this
wrong is the lock, not correctness.

`pg_trgm` may be refused by a managed role. That one statement is inside a DO
block that swallows the refusal, exactly like the 29 Aug search migration —
people search simply stays unindexed and nothing else is affected. Check with
`SELECT * FROM pg_extension WHERE extname = 'pg_trgm';`.

---

## 4 · A hash matcher behind `CSAM_MATCH_URL`

`src/media/hash-match/` is the seam; the contract is one POST, JSON in, JSON out,
documented in `hash-match.provider.ts`. Put an adapter for whichever service you
are approved for behind that URL — Cloudflare's CSAM Scanning Tool, Thorn Safer
or Microsoft PhotoDNA. All three need a verified account, which is why the
repository holds an interface and not a vendor.

**Until it is set, the gate fails closed and no photograph can be posted, sent or
approved anywhere in the city.** That is deliberate and it is the owner's call: a
CSAM gate that quietly approves when it is unconfigured is worse than none,
because it is believed. `assertProductionConfig` puts the reason on the problems
list at boot.

**And the part that is not code:** `CsamHit` rows with `reportedAt IS NULL` are
reports somebody owes. Nothing in this repository files them — that submission is
an account-holder obligation with its own credentials and its own legal review.
Someone has to watch that table, and the row plus the preserved object is what
they need to file with. Suspension, preservation and the Sentry alarm are
automatic; the report is not.

```sql
SELECT "detectedAt", "userId", "surface", "storageKey", "bucket", "source"
FROM "CsamHit" WHERE "reportedAt" IS NULL ORDER BY "detectedAt";
```

---

## 5 · `AI_DAILY_CALLS_GLOBAL`, set from your own daily actives

The default moved from 20,000 to 250,000 (`ai/model-budget.service.ts`), sized
for roughly 100,000 daily citizens at ~2.5 free model calls each. **It is not a
number to inherit.** The arithmetic is calls-per-citizen × citizens, and the
first number depends on which hubs are open.

The cap is still a cap — it is the last thing between a runaway loop and an
invoice, so it does not degrade into "warn and allow". What changed is that it no
longer arrives without warning: at 50%, 80% and 95% of the day's allowance it
logs at error level, once each, which reaches Sentry and the `/dev` tally. If you
see the 50% line at lunchtime, raise the number before dinner.

Watch `ai:paid:<day>:_global` too. Paid work is never refused, so that counter is
the alarm rather than the cap, and an anomaly there is a bug spending money
rather than a citizen spending it.

---

## 6 · What is still open

Fixed in this pass, listed here only so nobody re-does them: the encode is off
the API box, the chat list no longer reads every message in every room, the
profile no longer materialises a follower graph to count it, the ten indexes
above, the hash gate, the Turnstile refusal, the card branch of `chargeOn`, the
free/paid split, Mira's prompt caching and meter claim, the beauty downscale and
tier, and the per-call metering in `createWithFallback`.

Still open, and each one is written up in the 6 Sep reading:

- **Denormalised `likeCount` / `commentCount` on `Post`.** Every heart tap
  exact-counts the post's likes, and `POST_INCLUDE` emits up to 84 correlated
  aggregates per feed page. The profile's copy of that problem is behind a
  thirty-second read cache now; the feed's is not.
- **`Conversation.lastMessageAt`.** The raw `DISTINCT ON` made the chat list
  survivable; a denormalised column would make it free.
- **The beauty free-analysis race.** Two concurrent requests both read an empty
  `acceptedAnalysesJson` and both get a free vision call.
  `AstrologyService.ask` has the pattern to copy — the read value carried into
  the WHERE of a conditional `updateMany`.
- **The refresh token in `localStorage`.** The server already sets the HttpOnly
  cookie; the client deliberately does not send it.
- **A socket cap per account**, and the socket rate limits moved to the same
  Redis counters the HTTP routes use.
- **An HLS ladder for City TV.** `preload="metadata"` was the same-day half.
- **Moderation headcount.** The queue arithmetic in the reading gives 8–20
  full-time people at a million users, and no code change substitutes for that.

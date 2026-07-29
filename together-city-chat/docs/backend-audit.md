# Backend audit — data scoping

Produced 2026-07-29. Regenerate the numbers with `npx jest src/security`.

## What was checked

Every model in `schema.prisma` carrying a `userId` column belongs to exactly one
citizen — 52 of them. Every Prisma call against those models in the service layer
was located (279 of them) and checked for whether it names an owner.

**39 do not.** All 39 were read individually. **None leaks data across citizens.**

The finding is not "the code is fine, move on" — it is that the 39 are load-
bearing decisions that nothing was protecting. `src/security/query-scoping.spec.ts`
now freezes the reviewed set, so a new unscoped query fails the suite until
someone justifies it.

## Why each of the 39 is safe

**Ownership established a line earlier (11).** `deleteRecord` loads the row with
`findFirst({ id, userId })`, throws if it is absent, then deletes by id. The
delete itself carries no userId because the check already happened. Same shape in
`jobs` (`app.userId !== userId`, `job.postedById !== userId`), `social` (a Like
found by user+post, then deleted by id), and the medical panel upsert.

**The identifier IS the credential (5).** A refresh token is found by its own
hash, a password reset by its token, a dead push subscription by its value. There
is no user to scope by until the credential resolves to one.

**Shared catalogue (4).** Doctors and dietitians are Users, so those tables carry
a userId, but the rows are a public directory every citizen is meant to read.

**Aggregates returning no rows (4).** Restaurant popularity counts, likes on a
post: a number computed over everyone's data that discloses nobody's.

**Plan-key routes (15).** Recorded in detail below because they took the longest
to clear.

## The two that were genuinely ambiguous

**MealPlan keys are random, not user-derived.** A key is `'wk_' + rand(8)`, so
`findUnique({ where: { key } })` is safe only if something else checks the owner.
Every route that accepts a key from the request does, by one of three routes:
seven call `assertOwnsPlan`; `buildCart` folds `userId` into the query itself;
and `daySummary` runs a richer check of its own that additionally lets a
household member read the shared family plan read-only. Nothing reaches a plan
by key without one of those.

**JobApplication looks unscoped everywhere.** Six queries address applications
by id or by jobId with no userId in sight. Each is preceded by an explicit
ownership throw — the candidate for withdrawals, the recruiter for status
changes and applicant lists.

## Related findings, not scoping leaks

**`mealPlan.deleteMany({})` — every citizen's meal plans, on boot.**
`nutrition.service.ts` deletes ALL meal plans for ALL users when it adopts a v2
recipe dataset, because plans hold a foreign key to recipes. It is deliberate and
commented ("they regenerate"), and it only fires when the shipped dataset
changes. It is recorded here because it is the single most destructive statement
in the codebase, it runs unattended at startup, and nothing gates it behind an
environment flag or logs how many rows it removed. Worth revisiting before there
are citizens whose plans matter to them.

**Stale `as never` casts.** Several Prisma writes cast because the generated
client used to lag the schema (`weekStart`, and the `clearedAt` ones already
cleaned up). The client is regenerated now; each remaining cast hides real type
checking and should go. `as never` on an update silently swallows a misspelled
field name.

## What this does NOT prove

These are source-level checks. They prove a query names an owner; they do not
execute it.

That gap now has a suite of its own: `src/security/runtime-isolation.spec.ts`
boots the real application against a real Postgres, registers two unrelated
citizens, has the first create resources, and has the second try to read,
change and delete every one of them by id. It also proves the first citizen's
data is still there afterwards, so a DELETE that answered 403 and deleted
anyway cannot pass.

    TEST_DATABASE_URL=postgres://…/together_city_test npm run test:isolation

Without that variable the live half skips and says so on the console, because a
suite that quietly skips reports green while checking nothing. The structural
half always runs, and the assertion worth knowing about is this one: every
controller with a route that takes an id from the caller must be either probed
by the harness or listed in UNPROBED with a reason. Adding a hub with a `:id`
route fails the build until somebody decides which it is.

What it still does not prove: the UNPROBED list is long. Most entries are
resources that cannot be created from a bare account without an upload, a
connection, or a paid provider — real reasons the harness is hard to extend,
and not reasons those routes are safe. The static guards remain the only
coverage there.

# Removed routes

**Resolved 2026-07-30.** The pages are now named — the annotated site review
lists them on p14, p18 and p26 — so this file is no longer a placeholder.

The removals and the decision about their data are written up in
[removed-tabs-retention.md](./removed-tabs-retention.md). Six routes are marked
`@Deprecated(...)` with a sunset of 2026-08-30; no rows were deleted.

The original note is kept below, because the procedure it describes is the one
that was followed.

---

Item 13 of the backend brief asked for obsolete pages and their endpoints to be
retired, referring to slides 17, 19, 24 and 28 — which did not name the pages.
Removing a route on a guess is the one version of this task that can break a
working screen, so nothing was touched until the review named them.

The procedure is:

1. Grep the client for calls to the endpoint (`together-city-react/src`). If any
   active route still calls it, stop — the page is not obsolete yet.
2. Delete the controller route. Keep the Prisma model if the data must be
   retained; removing a route does not delete anything.
3. For an endpoint that must stay reachable during a migration, return
   `410 FEATURE_DISABLED` rather than deleting it, so an old client gets a clear
   answer instead of a 404 it will treat as a bug.
4. Record it here: route, date, reason, and whether the model was kept.

The route inventory that `src/security/route-exposure.spec.ts` builds is the
fastest way to see the current surface — 348 routes across 31 controllers — and
that suite will fail if a removal changes the authenticated surface unexpectedly.

| Route | Removed on | Reason | Model kept? |
|---|---|---|---|
| _(none yet)_ | | | |

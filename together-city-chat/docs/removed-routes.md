# Removed routes

**Nothing has been removed.**

Item 13 of the backend brief asks for obsolete pages and their endpoints to be
retired, referring to slides 17, 19, 24 and 28 — which do not name the pages.
Removing a route on a guess is the one version of this task that can break a
working screen, so nothing has been touched.

When the pages are named, the procedure is:

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

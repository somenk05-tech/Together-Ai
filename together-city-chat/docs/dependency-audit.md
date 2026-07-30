# Dependency audit — 2026-07-29

`npm audit` reports **74 advisories on the API (1 critical, 43 high)** and
**18 on the frontend (0 critical, 15 high)**. Those numbers, on their own, are
close to meaningless, and acting on them by running `npm audit fix --force`
would be worse than leaving them: it would major-bump NestJS, ESLint and Vite
in one unreviewed step.

What follows is every advisory that could plausibly matter, checked against
whether the vulnerable code path is reachable in this application at all.

## The short version

**Nothing found here is reachable by a request to the production API.** The
count is dominated by build and test tooling that never ships, plus one
transitive chain (`multer`) whose entry points this codebase does not use.

One real change was made: the frontend's `vitest` was moved from `^2.1.8` to
`^3.2.7`, which removes the single critical advisory. That one was
self-inflicted — vitest was added the same day, and 2.x carries
GHSA-5xrq-8626-4rwp.

## API — the advisories that reach production dependencies

### multer — 4 high, all denial of service. NOT REACHABLE.

Pulled in by `@nestjs/platform-express`. Every advisory concerns parsing a
multipart upload: incomplete cleanup, resource exhaustion, uncontrolled
recursion, deeply nested field names.

This codebase never parses multipart. There is no `FileInterceptor`, no
`FilesInterceptor`, no `multer` import and no `multipart` handling anywhere in
`src/`. Files reach the API two ways: base64 in a JSON body (medical reports,
beauty photos), and presigned PUTs the browser sends straight to R2/S3, which
never touch this server. multer is installed and never invoked.

Fixing it anyway means NestJS 11 — a real major upgrade of the framework this
whole API is built on. Worth doing on its own schedule with the test suite as
the safety net, not as a security response.

### @nestjs/core SSE injection (GHSA-36xv-jgw5-4q75) — moderate. NOT REACHABLE.

Newlines are not sanitised when interpolated into Server-Sent Events output, so
a developer who maps user input into an SSE message's `type` or `id` can have
events forged. The advisory is explicit that ordinary HTTP requests cannot
trigger it — developer code has to put user input in those fields.

This application has no SSE at all: no `@Sse()` decorator, no
`text/event-stream`. Real-time goes over Socket.IO. Patched in 11.1.18, which is
again the NestJS 11 upgrade.

### qs DoS (GHSA-q8mj-m7cp-5q26) — moderate. Almost certainly not reachable.

The crash is in `qs.stringify`. Express uses `qs.parse` to read query strings;
it does not stringify attacker-controlled input on the request path.

### body-parser (GHSA-v422-hmwv-36x6) — low.

DoS when an invalid `limit` value is silently ignored. `main.ts` sets explicit
numeric limits, so the condition does not arise.

### tar, via argon2 → @mapbox/node-pre-gyp — 1 critical + several high. INSTALL-TIME ONLY.

This is where the API's single "critical" comes from. `node-pre-gyp` downloads
and extracts a prebuilt binary for argon2, and every one of these advisories is
about extracting a hostile archive — path traversal, symlink poisoning,
decompression DoS.

That happens during `npm ci` in the Docker build, against the public npm
registry, not while serving requests. Exploiting it means compromising the
registry or the argon2 release artefacts, at which point tar is not the problem.

`argon2` 0.45.1 fixes it and is a major bump of a native module. Worth doing —
argon2's surface here is `hash` and `verify` and unlikely to break — but it
needs a real build on the deployment platform to confirm, not a version bump on
someone's laptop.

## API — everything else

The remaining ~60 are `jest`, `@nestjs/cli`, `eslint`, `typescript-eslint` and
their transitive trees (`minimatch`, `brace-expansion`, `glob`, `rimraf`,
`babel-*`). They run on a developer machine or in CI and are not installed in
the production image at all — the Dockerfile builds and then runs `node
dist/main.js`.

## Frontend

All 18 are devDependencies. Nothing here ships in the bundle Vercel serves.

- **vite** (3 high/moderate): `server.fs.deny` bypass, path traversal in dev
  optimized-deps `.map` handling, launch-editor NTLM disclosure on Windows.
  Every one is about the **dev server** — `npm run dev` on a laptop. The
  production artefact is static files. The fix is Vite 6 or 7, a major bump that
  also pulls the Vitest and plugin versions with it.
- **eslint + typescript-eslint chains** (12 high): `minimatch` /
  `brace-expansion` ReDoS in lint tooling. Fix is ESLint 10, a major.
- **vitest**: fixed, see above.

## What to actually do, in order

1. **Done** — vitest to `^3.2.7`, clearing the only critical that was reachable
   by anyone running this repo's own tooling.
2. **NestJS 10 → 11**, on its own, with the full jest suite as the gate. Clears
   multer, the SSE advisory, qs and body-parser in one move. This is a framework
   upgrade, not a patch.
3. **argon2 0.31 → 0.45**, verified by an actual Docker build on Render, since
   it is a native module and the failure mode is a container that will not boot.
4. **Vite 5 → 7 and ESLint 8 → 10** whenever the tooling is being touched
   anyway. Neither affects what a citizen can reach.

## How to re-check

    cd together-city-chat && npm audit
    cd together-city-react && npm audit

Read the count, then read this file before believing it. A high-severity
advisory in a package whose entry point the application never calls is not a
high-severity problem — and treating it as one is how a framework gets
major-bumped at 2 AM to fix nothing.

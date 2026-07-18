# Together City — Production Deployment Runbook

Deploying the full app with a **real database and persistent data**. This covers the two
pieces that deploy separately: the **NestJS API** (Postgres + Redis) and the **Vite frontend**
(static hosting).

---

## Honest readiness assessment

**The backend is real, not a stub.** The NestJS project (`together-city-chat/`) has:

- 24 hub controllers exposing **140 REST endpoints** (the Express mock has 138 — near parity)
- 23 services with real Prisma queries (~3,650 lines of actual DB logic)
- A complete **59-model + 6-enum Prisma schema**, a seed script, JWT access/refresh auth,
  Helmet, CORS-from-config, validation pipes, and a Socket.IO gateway for chat
- A documented `.env.example` covering Postgres, Redis, media storage (R2/S3), and
  OTP/email/push providers (Twilio, SendGrid, FCM)

**Build status: VERIFIED GREEN.** The Prisma 7 migration is complete and tested on the real
Prisma 7.8.0 CLI: `npx prisma generate` runs clean **with no database configured** (exactly
like the Docker build step), `npm run build` compiles with **zero errors**, the schema passes
`prisma validate` both with and without `DATABASE_URL`, the seed script type-checks, and the
compiled app lands at `dist/main.js` — the exact path the Dockerfile boots.

Key pieces of the completed migration (all committed):
- `prisma.config.ts` — Prisma 7's config file. The datasource block is included **only when
  `DATABASE_URL` is set** (per `@prisma/config` types, datasource is optional and only needed
  by commands that touch the database). So build-time generate needs no DB; runtime
  migrate/db push/seed read the platform-injected URL; local CLI reads `.env` via dotenv.
- `schema.prisma` — the v6-style `url =` line removed (required by v7); deprecated preview
  flags removed (driver adapters + query compiler are standard in v7).
- `PrismaService` — already used the `@prisma/adapter-pg` driver adapter (engine-less); unchanged.
- `tsconfig.build.json` — new; scopes the production build to `src/` so output is `dist/main.js`
  (previously `dist/src/main.js`, which would have crashed the container at boot).
- `package.json` — `dotenv` added as a dev dependency; deprecated `prisma.seed` block removed
  (seed now configured in `prisma.config.ts`).

**Endpoint parity caveat.** The frontend and this backend were built to the same API contract,
but the most recent frontend pages (the batch 1–3 sub-pages) were developed against the Express
mock. A few endpoints may 404 or differ in request/response shape until smoke-tested. A handful
of pages (the Family Nutrition sub-hub, some fitness/real-estate views) run on **local/static
data by design** and won't persist to the DB — that's unchanged from today.

**Bottom line:** this is a real deployment of a real backend, gated on (1) a build cleanup you
run where Prisma can generate, and (2) provisioning Postgres + Redis. Plan for a day or two to
first green deploy, plus smoke-testing.

### Integration status for your chosen stack

Your stack — React/Vercel · NestJS · Postgres · Redis · R2 · Firebase · Resend/SendGrid — is
exactly what this backend was designed around. Current state per piece:

| Piece | Status | What's needed |
|---|---|---|
| PostgreSQL | ✅ **Done** | Full Prisma schema + real queries. Just provision a DB. |
| Redis (cache + Socket.IO) | ✅ **Wired** | `ioredis` installed and used. Just provision Redis. |
| Cloudflare R2 (media) | ✅ **Implemented** | `media/storage.provider.ts` now signs a real PutObject via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Set the `S3_*` + `MEDIA_*` env vars; falls back to unsigned URLs if unset. |
| Firebase (push) | ✅ **Implemented** | `notifications/fcm.provider.ts` uses `firebase-admin` (`getMessaging().sendEachForMulticast`). Set `FCM_ENABLED=true` + the service-account vars; no-ops if unset. |
| Email (Resend) | ✅ **Implemented** | `mail/messaging-provider.ts` has a real `ResendEmailProvider`. Set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`. SendGrid is a one-case drop-in behind the same interface. |

All four SDKs (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `firebase-admin`, `resend`)
are installed and the lockfile is in sync. Each provider **degrades gracefully** — unset env vars
mean media returns unsigned URLs and push/email no-op with a log, so the app still boots and core
flows work. Turn each on by adding its env vars; no code change needed.

---

## Architecture

```
[ Browser ]
     |
     |  HTTPS + WSS
     v
[ Frontend: Vite static build ]        [ Backend: NestJS ]
  Netlify / Vercel / Cloudflare  --->    Railway / Render / Fly.io
                                            |         |
                                            v         v
                                       [ Postgres ] [ Redis ]
```

The frontend is fully static; it talks to the backend only over HTTPS (REST) and WSS (chat),
using the `VITE_API_URL` / `VITE_SOCKET_URL` env vars — no backend URL is hardcoded.

---

## Recommended hosts

- **Backend + Postgres + Redis → Railway** (best all-in-one DX for this stack): provision a
  Postgres and a Redis plugin, deploy the repo via its Dockerfile, wire internal URLs. Websockets
  work out of the box. ~$5/mo minimum.
- **Alternative → Render**: use the committed `render.yaml` blueprint (web service + Postgres +
  Key Value). Free tiers spin down and the free Postgres expires after ~30 days, so choose paid
  plans for anything real.
- **Frontend → Vercel** (your choice): committed `vercel.json` sets the SPA rewrite and the
  `--base=/` build command. Import the repo, set the root to `together-city-react/`, add the two
  `VITE_*` env vars, deploy. (`netlify.toml` is also included if you ever want Netlify.)

---

## Files already added to the repos

**Frontend (`together-city-react/`)**
- `.env.production` — template; fill in your backend domain (and set the same vars in the host UI)
- `netlify.toml` — build command `npm run build -- --base=/` + SPA redirect
- `vercel.json` — same, for Vercel
- `public/_redirects` — SPA fallback for Netlify/Cloudflare Pages

> **Why `--base=/`:** `vite.config.ts` uses `base: './'` for the Capacitor mobile build. On the
> web that breaks a deep-link refresh (e.g. reloading `/travel/trains` resolves assets against
> `/travel/` and 404s). The build command overrides it to `/` for web only — your Capacitor flow
> is untouched.

**Backend (`together-city-chat/`)**
- `Dockerfile` — installs deps, runs `prisma generate`, builds, and on boot applies migrations
  (or `db push` on first deploy) then starts. Works on Railway/Render/Fly/any Docker host.
- `.dockerignore`
- `render.yaml` — Render blueprint provisioning the web service + Postgres + Redis

---

## Step-by-step

### 1. Create the initial database migration (once, on your machine)

The repo has no `prisma/migrations/` yet. Either:

**Option A — proper migration history (recommended):** with a local Postgres running,
```bash
cd together-city-chat
npx prisma migrate dev --name init     # creates prisma/migrations/…
git add prisma/migrations && git commit -m "Add initial migration"
```
Then the container's `prisma migrate deploy` applies it on every deploy.

**Option B — skip migrations for now:** commit nothing extra. The Dockerfile falls back to
`prisma db push` on first boot to create the schema directly. Fine to start; adopt migrations
later with Option A.

### 2. Deploy the backend

**Railway**
1. New project → Deploy from your repo (point it at `together-city-chat/`, which has the Dockerfile).
2. Add a **PostgreSQL** plugin and a **Redis** plugin to the project.
3. In the API service **Variables**, set (Railway exposes the plugin URLs as referenced vars):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL` = `${{Redis.REDIS_URL}}`
   - `NODE_ENV=production`, `PORT=4000`
   - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` = long random strings
     (`openssl rand -hex 32`)
   - `JWT_ACCESS_TTL=900`, `JWT_REFRESH_TTL=1209600`, `FCM_ENABLED=false`
   - `CORS_ORIGIN` = your frontend URL (fill in after step 3, then redeploy)
4. Deploy. Watch logs: you want `prisma generate` → build → `migrate deploy`/`db push` →
   `Together City chat API on :4000`.
5. Note the public API URL (e.g. `https://together-city-api.up.railway.app`).

**Render** (alternative): push `render.yaml`, then New → Blueprint → pick the repo. It creates the
web service, Postgres, and Redis and wires `DATABASE_URL`/`REDIS_URL` automatically. Set
`CORS_ORIGIN` after the frontend is up.

### 3. Seed the database (optional but recommended for a demo)

From the host's shell/one-off job:
```bash
npx prisma db seed        # runs prisma/seed.ts
```
Or hit the register endpoint to create your first real user.

### 4. Deploy the frontend

1. Edit `together-city-react/.env.production` (or set these in Netlify/Vercel env vars):
   ```
   VITE_API_URL=https://YOUR-BACKEND-URL/api
   VITE_SOCKET_URL=https://YOUR-BACKEND-URL
   ```
2. Netlify: New site from Git → pick the repo, base directory `together-city-react/`. The
   `netlify.toml` build command and SPA redirect are already set. Deploy.
3. Copy the frontend URL (e.g. `https://togethercity.netlify.app`).

### 5. Close the CORS loop

Set the backend's `CORS_ORIGIN` to the exact frontend URL from step 4 and redeploy the backend.
The browser will reject API calls until this matches.

### 6. Smoke-test

Log in, then click through one page per hub. Watch the browser Network tab for `404`/`400`s —
those flag endpoints where the frontend and this backend disagree (see the parity caveat). Note
them; they're quick, isolated fixes. Verify chat connects (WSS) and a message round-trips.

---

## Environment variables reference

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string (from the DB plugin) |
| `REDIS_URL` | ✅ | Redis connection string (presence, pub/sub, socket scaling) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ✅ | Long random strings; never reuse the `change-me` defaults |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | ✅ | Seconds (900 / 1209600) |
| `CORS_ORIGIN` | ✅ | Exact frontend origin |
| `PORT` / `NODE_ENV` | ✅ | `4000` / `production` |
| `MEDIA_PROVIDER=r2`, `MEDIA_BUCKET`, `MEDIA_PUBLIC_BASE_URL` | media | Your R2 bucket + public base URL (custom domain or r2.dev) |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto` | media | R2 endpoint `https://<accountid>.r2.cloudflarestorage.com` + R2 API token |
| `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | email | `EMAIL_FROM` must be a Resend-verified sender |
| `FCM_ENABLED=true`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | push | From your Firebase service-account JSON (keep the key's `\n`s) |
| `SMS_PROVIDER=twilio`, `TWILIO_*` | ⛔ optional | Only if you add the Twilio SMS adapter for phone-OTP recovery |

Each provider degrades gracefully: leave its vars unset for a first core deploy (media returns
unsigned URLs, push/email no-op) and add them when you turn that feature on — no redeploy of code,
just env vars.

---

## What "production for real users" additionally implies (later)

- Commit real Prisma migrations (Option A) rather than relying on `db push`.
- A custom domain + managed TLS on both frontend and backend.
- Backups on Postgres; a Redis plan that persists.
- Verify the R2 upload round-trip end-to-end (presign → client PUT → public URL) and set a CORS
  policy on the bucket that allows PUT from your frontend origin.
- Rate limiting, logging/monitoring, and tightening CORS/Helmet for your domains.
- Resolve the endpoint-parity gaps found in smoke-testing so every hub reads/writes the DB.

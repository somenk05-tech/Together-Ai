# Together City

A 14-hub "super-app" — one city for life: travel, dining, nutrition, entertainment,
social life, dating, real estate, jobs, medical, finance, beauty, fitness, mail, and
family nutrition — built around one identity, one wallet, one inbox, and chat woven
through every hub.

## Repository structure

| Folder | What it is | Stack |
|---|---|---|
| `together-city-react/` | The web app (frontend) — 100+ screens across all hubs | React 18 · Vite · TypeScript · TanStack Query |
| `together-city-chat/` | The API (backend) — 140 REST endpoints + real-time chat | NestJS · Prisma 7 · PostgreSQL · Redis · Socket.IO |

Supporting documents in the repo root:

- `together-city-deployment-runbook.md` — how to deploy (Railway backend, Vercel frontend), with an honest readiness assessment and environment-variable reference.
- `together-city-complete-details.md` — the full product inventory: every hub, every page, the platform features, and the design language.

## Backend at a glance

- **Prisma 7** (fully migrated and verified): engine-less client via the `@prisma/adapter-pg`
  driver adapter; datasource configured in `prisma.config.ts`; 59-model PostgreSQL schema.
- **Auth**: JWT access/refresh, handle-based identity, email/phone recovery with OTP.
- **Integrations** (each behind a swappable provider, all degrade gracefully when unconfigured):
  Cloudflare R2 media uploads (S3-compatible presigned PUT), Firebase Cloud Messaging push,
  Resend email.
- **Docker**: the committed `Dockerfile` installs, generates the Prisma client (no database
  needed at build time), compiles, then on boot applies migrations (or pushes the schema on
  first deploy) and starts the API.

## Frontend at a glance

- Pavilion-city homepage with clickable districts; per-hub theming on a shared design system
  (warm paper, ink, muted gold, serif headlines).
- Typed API client, route-level code splitting, auth-gated routes, Socket.IO chat.
- Deploy config included for Vercel (`vercel.json`) and Netlify (`netlify.toml`), SPA fallback,
  `--base=/` web build (Capacitor mobile build unaffected).

## Running locally

Backend (`together-city-chat/`): copy `.env.example` to `.env`, point `DATABASE_URL` at a local
PostgreSQL and `REDIS_URL` at a local Redis, then `npm install && npx prisma generate &&
npm run start:dev`. Frontend (`together-city-react/`): set `VITE_API_URL` / `VITE_SOCKET_URL`
in `.env`, then `npm install && npm run dev`.

## Deploying

See `together-city-deployment-runbook.md` — short version: push this repo, point Railway at
`together-city-chat/` (add PostgreSQL + Redis, set the variables), point Vercel at
`together-city-react/` (set the two `VITE_*` variables), then set the backend's `CORS_ORIGIN`
to the frontend URL.

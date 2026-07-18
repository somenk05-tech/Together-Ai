# Together City — React Frontend

The modern frontend for Together City (web + Android/iOS via Capacitor), rebuilt from
the vanilla HTML/CSS/JS reference site while preserving the exact UI, branding, and UX.

## Stack
- **React 18** + **TypeScript** (strict, no `any`) + **Vite**
- **React Router** (data router, lazy route splitting)
- **Tailwind CSS** — theme mapped to the ported design tokens
- **TanStack Query** — server state + API caching
- **Zustand** — client state (auth, UI), replaces `localStorage` engines
- **Socket.IO Client** — real-time (chat, presence, notifications)

## Run
```bash
npm install
cp .env.example .env      # set VITE_API_URL / VITE_SOCKET_URL to your NestJS backend
npm run dev               # http://localhost:5173
npm run typecheck         # strict tsc
npm run build             # production build → dist/
```

## Backend
Talks to the existing **NestJS** backend — no engine logic is duplicated client-side.
- REST via a typed axios layer (`src/services/api`), JWT attach + silent refresh.
- Real-time via `src/services/socket.ts` (token-authenticated Socket.IO).
- Endpoints are grouped by resource: `auth`, `connections`, `chat`, `notifications`,
  `search`, and the nutrition meal-planner.

## Architecture (feature-first)
```
src/
  app/          App, Router (lazy), Providers (Query + auth hydrate)
  layouts/      AppShell, HubLayout, Header, Sidebar, Footer  (ported from tc.js)
  components/ui Button, Card, Pill, Tag, StatCard, Hero, EmptyState, Spinner
  pages/        Home, HubLanding (data-driven for all 12 hubs), HubStub, NotFound
  features/
    nutrition/  types, api, hooks (TanStack Query), components, pages (WeeklyPlanner)
    …           chat, dating, travel, medical, marketplace, jobs, shopping, profile
  hooks/        useSocket, useSocketEvent, useHubTheme
  services/     api/ (axios + resources), query.ts, socket.ts
  store/        auth.store.ts, ui.store.ts (Zustand)
  config/       hubs.ts — NAV (header tabs) + HUBS (sidebars) ported 1:1 from tc.js
  types/        shared domain types
  styles/       tokens.css (design tokens), layout.css (shell)  — ported from tc.css
```

## Design system
`src/styles/tokens.css` ports the vanilla site's `:root` tokens verbatim (colours,
radii, shadows, fonts) and the per-hub accent theming (`[data-hub="…"]`). The ported
component classes (`.btn`, `.card`, `.pill`, `.hero`, `.stat`, …) live in `index.css`,
so components keep visual parity while composing with Tailwind utilities.

## Mobile / Capacitor
- `viewport-fit=cover` + `env(safe-area-inset-*)` wired into the shell.
- Header/sidebar collapse to a drawer under 1100px; nav is horizontally scrollable.
- `vite base: './'` so the bundle works from the app container.
- To wrap: `npm i @capacitor/core @capacitor/cli && npx cap init && npx cap add ios android && npm run build && npx cap sync`.

## Migration status
**Phase 2 done** — Auth (handle+password → NestJS `/auth/login|register|refresh`, `/users/me`), Profile (`/profile/summary`), and real-time Chat (`/chat/*` + Socket.IO `WS` events) are wired to the existing backend (no mocks). Two missing endpoints were added to NestJS: `ProfileModule` (`GET/PATCH /profile`). 

Nutrition is the **fully-migrated reference vertical** (Weekly Planner: paginated day
view, meal cards with per-serving g/plate, Daily Nutrition Overview with red-when-over,
TanStack Query against the NestJS planner). Every other hub landing renders from config;
inner pages render `HubStub` until migrated, following the same pattern. See `MIGRATION.md`.

## Typed API SDK (`src/api`)
The app talks to the backend **only** through the SDK — it never calls `fetch()` or axios
directly. Every response is validated at runtime with **Zod**, and TS types are inferred
from those schemas (single source of truth).

```
src/api/
  client.ts          axios instance + JWT attach + silent refresh (the only HTTP surface)
  http.ts            apiGet/apiPost/… — validate every response against a Zod schema
  schemas.ts         Zod entity schemas → inferred types (User, Message, Connection, …)
  events.ts          WS event-name constants (mirror the NestJS gateway)
  socket.ts          typed Socket.IO wrapper (connect/emit/on)
  auth.api.ts        /auth/*            + input schemas
  users.api.ts       /users/*           + useMe / useOnlineContacts
  connections.api.ts /connections/*     + useConnections / useRequest / useRespond
  chat.api.ts        /chat/*, /messages + useConversations / useMessages / useChatRealtime
  notifications.api.ts /notifications/* + useNotifications / useMarkNotificationRead
  media.api.ts       /media/upload      + presign → PUT upload (axios)
  index.ts           barrel — import everything from '@/api'
```
Usage: `import { useConversations, chatApi, socketClient } from '@/api';`

# Together City — Vanilla → React Migration Plan

The vanilla site is the visual/functional spec. This React app reproduces it 1:1 and
becomes the long-term frontend. Migration is phased; the architecture is already in place.

## Principles
- Preserve UI, branding, colour, typography, icons, nav, layout, flows, animations.
- Replace `localStorage` engines (`tc-*.js`) with **NestJS APIs + TanStack Query + Zustand**.
- Replace DOM manipulation with components; page reloads with React Router.
- One data-driven component per repeated pattern (hub landings, meal cards, stat cards…).

## Page inventory (130 vanilla pages → routes)
| Vanilla | React route | Feature | Status |
|---|---|---|---|
| index.html | `/` | pages/Home | ✅ done |
| {hub}.html ×12 | `/{hub}` | pages/HubLanding (config-driven) | ✅ done (all 12) |
| nutrition-weekly.html | `/nutrition/weekly` | features/nutrition | ✅ reference |
| nutrition-daily.html | `/nutrition/daily` | features/nutrition | ⬜ backlog |
| nutrition-recipes / recipe-detail | `/nutrition/recipes[/:id]` | features/nutrition | ⬜ backlog |
| nutrition-grocery / cart / orders | `/nutrition/{grocery,cart,orders}` | features/nutrition | ⬜ backlog |
| nutrition-blood / preferences / supplements / dietitian | `/nutrition/*` | features/nutrition | ⬜ backlog |
| family-*.html | `/family/*` | features/nutrition (mode=family) | ⬜ backlog |
| profile / settings / chats / dashboard | `/{profile,settings,chats,dashboard}` | features/profile, features/chat | ⬜ backlog |
| social-*, dating-*, travel-*, restaurants-*, medical-*, beauty-*, jobs-*, financial-*, realestate-*, entertainment-*, fitness-* | `/{hub}/*` | per-feature folders | ⬜ backlog |

## Component map (reusables already built)
- **UI**: Button, Card, Pill, Tag, StatCard, Hero, EmptyState, Spinner.
- **Layout**: Header (12-tab nav), Sidebar (hub menu + back), Footer, AppShell, HubLayout.
- **Nutrition**: MealCard, DayTabs, DailySummary; hooks `useWeeklyPlan/useDaySummary/useNutritionTargets/useRegenerateWeek`.
- **Cross-cutting hooks**: `useSocket`, `useSocketEvent`, `useHubTheme`.

## Data flow
UI → feature hook (TanStack Query) → typed API service (`services/api`) → NestJS.
Realtime UI → `useSocketEvent` → Socket.IO gateway. Auth/UI state → Zustand.
No business logic (recipe engine, compatibility scoring, etc.) is reimplemented client-side.

## Phasing
1. **Foundation + Nutrition reference** — this delivery.
2. Auth + Profile + Chat (shared spine; wires Socket.IO end-to-end).
3. Nutrition remainder (daily, recipes, grocery, cart, orders, family).
4. Social, Dating, Travel, Restaurants (media + realtime heavy).
5. Medical, Beauty, Jobs, Financial, Real Estate, Entertainment, Fitness.
6. Capacitor packaging (iOS/Android), pull-to-refresh, gestures, store builds.

## Definition of done per page
Route + feature hook(s) + typed API + components + loading/empty/error states +
responsive + a11y (focus, labels) + matches the vanilla visual.

## Phase 2 — Auth + Profile + Chat (wired to the real NestJS backend)
The React integration layer is aligned to the **existing** backend contracts (source of
truth) — no mock data.

| Feature | React | Backend endpoint / event | Notes |
|---|---|---|---|
| Register | `authApi.register` | `POST /auth/register` `{handle,name,password}` | handle+password model |
| Login | `authApi.login` | `POST /auth/login` `{handle,password}` | returns tokens + userId |
| Current user | `authApi.me` | `GET /users/me` | used by store hydrate |
| Refresh | store `refresh()` | `POST /auth/refresh` `{refreshToken}` | silent via axios interceptor |
| Profile summary | `profileApi.summary` | `GET /profile/summary` | **added** ProfileModule |
| Update section | `profileApi.updateSection` | `PATCH /profile/section` | **added** |
| Conversations | `chatApi.conversations` | `GET /chat/conversations` | |
| Message history | `chatApi.messages` | `GET /chat/:id/messages` | |
| Send message | socket `WS.SEND_MESSAGE` | `send_message` → `receive_message` | + `POST /messages` fallback |
| Typing | socket `WS.TYPING_START/STOP` | `typing_start` / `typing_stop` | |
| Join/leave room | socket | `join_conversation` / `leave_conversation` | |

Socket event names live in `src/services/events.ts`, mirroring the backend's `chat.events.ts`.

### Backend changes made this phase
- Added **`src/profile/`** (module/controller/service) to `together-city-chat` and
  registered `ProfileModule` in `app.module.ts`. `GET /profile/summary` returns the user's
  identity + (initially empty) cross-hub contributions from the DB — real, not mocked.

### How to run & test end-to-end
```bash
# backend
cd together-city-chat && npm install && npx prisma migrate dev && npm run start:dev   # :3000
# frontend
cd together-city-react && npm install && cp .env.example .env && npm run dev            # :5173
```
Then: register a handle → land on Home → open Profile (loads `/profile/summary`) →
open Chats (loads `/chat/conversations`, joins the room, live send/receive via Socket.IO).

### Auth UX note
The vanilla mockup used passwordless email/Google/phone. The **existing backend implements
handle+password**, so the React sign-in uses that (styled with the Together City design
system). Passwordless/OAuth/OTP would be a backend addition (new auth strategies) — tracked
as a follow-up, not a mock.

# The control room behind the city — investor and founder analytics

Owner, 16 Sep. The page is **`/investor/analytics`**, linked by "See the full
numbers" under the live counter on `/investor`. This document says what every
number on it means, where it comes from, and what is not measured yet.

The rules live in code in one file:
`together-city-chat/src/insights/insights.config.ts`. If a rule below and that
file ever disagree, the file is right and this document is stale.

## The first rule: nothing is invented

- A number that cannot be measured yet is shown as **—** with the reason under it
  ("Not yet monetised — no payment partner is live", "AI calls are not metered
  yet"). It is never shown as 0 and never estimated.
- A change (↑ / ↓) is shown only when both periods have at least **5** of the
  thing counted (`MIN_FOR_TREND`). Otherwise the page says "Not enough data to
  establish a meaningful trend" or "No earlier period to compare".
- **Sample data** exists only behind the "Sample data" switch. It comes from one
  file, `together-city-react/src/features/insights/fake-dashboard.ts`, and only
  `api.ts` may import it (a test enforces this). While it is on, a banner says so,
  every section title carries a SAMPLE badge, every card has a dashed edge, and
  the CSV export is named and marked as sample. Even the sample data never shows
  revenue: the city is not monetised.

## Who can open it

| Who | How | What changes |
|---|---|---|
| Investor | The same password as the `/investor` deck, sent as the `x-investor-password` header to `GET /api/insights/investor`. Kept for the browser tab only (sessionStorage). | Aggregates only. The per-model AI breakdown, the wallet-credit total and the error detail of the health timeline are left out. |
| Founder / team | Signed in, with the `analytics.read` permission (`GET /api/insights`). Admin roles that hold it: the owner and the new `investor` role, which holds nothing else. | Everything above, plus those three details. |

Both routes return aggregates. No name, email, phone, handle, date of birth,
health record, dating detail or message text is selected by any query (a spec
checks the SQL). The live activity feed says **what** happened, never **who**.

## Time

- The city's day is the day in **India (Asia/Kolkata)**. "Today", "yesterday",
  the growth chart's days and the cohort weeks (Monday start) are all city days.
- Ranges: **24H** (today), **7D**, **30D**, **90D** (the last n city days,
  including today) and **All time**. Each change compares with the n days just
  before the window.
- Every section is cached for 60 seconds on the server. The overview refreshes
  every minute; the live feed and the health section every 30 seconds.

## Definitions

### Members and activity

| Metric | Definition |
|---|---|
| City members | Accounts that exist and are not closed, at the end of today. The change compares with the same count at the start of the window. |
| New members | Accounts created in the window, whether or not closed later. |
| Still members | Of those, accounts not closed since. |
| Growth rate | Change in City members over the window, as a share of the members at its start. |
| **Active (a member-day)** | A member is active on a city day when they used the signed-in app that day (any API request that succeeded) **or** created a record in one of the eight systems that day. |
| Active today / this week / this month (DAU / WAU / MAU) | Distinct members active on today / any of the last 7 / any of the last 30 city days. |
| Returning members | Members active in the window who had also been active on an earlier day. |
| Active days per member | Average number of distinct active days per active member in the window. |
| Avg time per active day | Seconds the app was on screen per member per active day (`UsageDay`). While a member is signed in and the app is visible, the web sends a beat every 30 seconds with the seconds it was visible; each beat counts at most 60 seconds, beats under 15 seconds apart are dropped, and a day tops out at 24 hours. Recorded from 16 Sep. |

### The eight personal systems

| System | A day of use (API prefix) | An interaction (a record the member created) |
|---|---|---|
| City Assistant | `/api/mira` | `MiraTurn` written by the member |
| Hair & Skin | `/api/beauty` | `LookAnalysis`, `BeautyOrder` |
| Fitness | `/api/fitness` | `WorkoutLog` (when done) |
| Nutrition | `/api/nutrition`, `/api/family` | `MealPlan`, `FoodJournalEntry`, `NutritionOrder` |
| Medical Records | `/api/medical`, `/api/medicines`, `/api/prescriptions` | `MedicalRecord`, `MedicalBloodTest`, `Prescription` |
| Find Love | `/api/dating` | `AppEvent` named `dating.*` |
| Astrology | `/api/astrology` | `AstroQuestion`, `AstroReading`, `TarotReading` |
| Pets | `/api/pets` | `Pet`, `PetPhoto` |

- **Members** of a system: distinct members who used it in the window (a day of use or an interaction).
- **Interactions**: records created in the window. Only the count is read, never the content.
- **Feature adoption**: members of each system ÷ all active members in the window. The systems are always shown in the city's order, not ranked.
- **Systems per member**: for each active member, how many of the eight they used in the window. The chart shows how many members used 1, 2 … 8. The headline is the average.

Because interactions are read from each system's own tables, they have history from
the day each system opened. **Days of use** are recorded as they happen from go-live of
this dashboard (16 Sep). Earlier days were **rebuilt** by the 16 Sep migration from what
already recorded a member and a day: the day they joined, sign-ins and token refreshes,
chat messages sent, posts, comments, likes, calls started and app events (only the
member and the day are copied). The page says "Daily activity recorded from 16 Sep,
rebuilt back to …". A member who only read, before 16 Sep, without signing in again
that day, is not in the rebuilt days.

### Activation, the journey and retention

- **Activated member** (`ACTIVATION`): used at least **2** of the eight systems
  within their first **7** days. Change `minSystems` / `withinDays` in the config
  and every number moves with it.
- **Activation rate**: activated ÷ members who joined in the window.
- **Retained** (`RETAINED`): activated, joined at least **14** days ago, and active in the last **7** days.
- **User journey** — each stage is a subset of the one above it, so no step can pass 100%:
  1. Website visitors — browsers that opened togethercity.app for the first time in the window (bots and link previews are not counted).
  2. Sign-ups — accounts created in the window.
  3. City members — of those, still open.
  4. Activated — of those, activated.
  5. Active this week — of those, active in the last 7 days.
  6. Retained — of those, joined at least 14 days ago.
  7. Paying — **not measured**: no payment partner is live.
- **Dn retention** (`RETENTION_DAYS`, `RETENTION_WIDTH`): of the members who joined
  in a cohort, the share active again in a window after the day they joined —
  **D1** = day 1, **D7** = days 7–13, **D14** = days 14–20, **D30** = days 30–36.
  A member counts only once they are old enough to have had that window; a cohort's
  cell is shown only once every member in it is. The headline Dn is over all
  members old enough; "7 of 18" shows the arithmetic.

### City Assistant and AI

| Metric | Definition |
|---|---|
| City Assistant users | Distinct members who sent at least one message in the window. |
| Conversations | One member in one room on one city day = one conversation. |
| Messages from members | Member messages in the window. |
| Messages per member | Messages ÷ members who sent any. |
| Avg conversation | Member messages per conversation. |
| Continuation rate | Share of conversations in which the member wrote more than once. |
| Returning AI users | Members who talked to the assistant on more than one day in the window. |
| AI requests, tokens | From the per-call ledger (`AiCall`): one row per call to a model, with the model, tokens in/out (and cached), how long it took, and whether it failed. No prompt, no answer. Recorded from 16 Sep. |
| Failed AI calls | Calls that ended in an error ÷ all calls. Founders also see the kinds: timed out, rate limited, model overloaded, model not found, key refused, provider error. A reply that came back but was not the JSON asked for is **not** a failed call. |
| AI response (median / p95) | Time from sending a call to its answer, successful calls only. |
| AI cost in window | Σ tokens × the rate for that model, from `AI_MODEL_RATES` (rupees per million tokens; cached tokens at their own rate, or the input rate if none is set). If any model used in the window has no rate, **no cost is shown** (the page names the model to founders) — never a low guess. |
| At this pace, a month | AI cost in the window ÷ days in the window × 30 (for All time: days since the first recorded call). A pace, not a forecast. |
| Cost / active member, / AI user, / conversation | AI cost in the window ÷ active members, ÷ members who talked to the assistant, ÷ conversations. |

To see AI cost, set **`AI_MODEL_RATES`** on the API service in Railway, e.g.
`{"claude-sonnet-5":{"in":250,"out":1250},"claude-haiku":{"in":80,"out":400}}` —
rupees per million tokens, keyed by model id (a key prices every model id that starts
with it). The rates are yours to set from your provider bill; the city never invents one.

### Where members come from

- A visit carries its first-touch origin: `utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term` and the **referring host only** (never
  the full address), kept in the browser from the first landing
  (`together-city-react/src/api/origin.ts`).
- Stored on the visitor's **first** visit (`SiteVisitor`) and, once, on the
  member's account after sign-up (`MemberOrigin`, `POST /api/insights/origin`).
- Source buckets: Direct, Google, Instagram, YouTube, Referral, Paid social, Other.
  A paid medium (`cpc`, `ppc`, `paid`, `paid_social`, `ads`) with a social source is Paid social.
- Sign-up rate = sign-ups ÷ visitors from that source. It is blank when the source had no recorded visitors.
- Visitors and members from before sources were recorded are counted in a note under the table, not in any row.

### Reach and member profile (aggregate only)

- City, from the city members typed in their profile, normalised (Bombay → Mumbai, Gurgaon → Delhi …). India and abroad are shown apart.
- Age, in bands (18–24, 25–34, 35–44, 45–54, 55+), from the date of birth in the profile.
- Device of first visit (phone / tablet / desktop), from the user agent at the first visit.
- Phone app installed (iOS / Android / Web), from push registrations.
- **Any group under 3 members is not shown** (`MIN_GROUP`) — it is folded into "Other" or into the note "n more in groups under 3". Totals and the journey are never suppressed; they name nobody.

### Money

- **Monetised: no.** No payment partner is live, so MRR, ARR, paying members,
  free → paid, ARPU are **—** with that reason. CAC needs acquisition spend (not
  recorded). LTV needs revenue and churn. Gross margin needs revenue and AI cost.
- The plan that is ready (City Assistant, 30 days, ₹999) is listed.
- In-app test subscriptions paid with wallet credit are shown as **a signal of
  intent, not revenue** (founders also see the credit total).

### Platform health

**Right now** — counted by this server process since it started (a deploy starts
again): requests, server errors (5xx), success rate, median and p95 response time, in
five-minute columns over the last 24 hours. Database: a `SELECT 1` and how long it took.

**Across deploys** — over the chosen window:

| Metric | Definition |
|---|---|
| Uptime | Every API process writes a `ServerRun` row when it starts and a beat every minute. A run counts as up from its start to its last beat plus 90 seconds. Uptime = time covered by at least one serving run ÷ the window (counted from the first recorded run). The worker service (`JOBS_ROLE=worker`) does not count as serving. |
| Downtime | The rest of that window — a crash, a deploy's gap or the platform. |
| Deploys / starts | Distinct commits started in the window / server starts in the window (a restart without a new version adds only to the second). |
| Crash-free sessions | App openings in the window that did not crash ÷ all openings. A session is one page load (web, or the city inside the iOS/Android apps), with a random id and a platform word — no account, no address, no page. It is marked crashed once, the first time a screen falls over (the error boundary) or an uncaught exception is thrown. A failed image load, a 404 page and a stale page that reloads itself after a deploy are not crashes. |
| Failed AI calls | As in the AI section. |

- **Not measured yet:** crashes in the phone apps' native layer (outside the web view).

## How the numbers are captured

| Instrument | Where | What it writes |
|---|---|---|
| Member-day | `src/insights/insights.interceptor.ts` → `member-day.service.ts` | One `MemberDay` row per member per city day, with the systems used that day, on any successful signed-in request. De-duplicated in memory; one upsert per member, system and day. |
| Request stats | `src/insights/request-stats.ts` | In memory only: five-minute buckets of requests, errors and response times. |
| Visit origin | `src/analytics/visits.controller.ts`, `visit-origin.ts` | Source columns on `SiteVisitor`, on the first visit. |
| Member origin | `src/insights/member-origin.service.ts` | One `MemberOrigin` row per member, never overwritten. |
| AI bill | `src/ai/ai-ledger.service.ts`, called from the three model-call sites in `ai.service.ts` | One `AiCall` row per call: model, tokens, ms, failed + kind. Never awaited — a slow ledger never slows an answer. |
| Time in app | `together-city-react/src/api/pulse.ts` → `POST /insights/beat` → `src/insights/pulse.service.ts` | `UsageDay` seconds per member per city day, capped. |
| Sessions and crashes | `pulse.ts` (`startSession`, `reportCrash` from `ChunkBoundary`) → `POST /insights/session` | One `AppSession` row per page load; `crashes`, `crashKind`. |
| Uptime | `src/insights/server-run.service.ts` | One `ServerRun` row per process; `lastBeatAt` every minute. |
| Everything else | the systems' own tables | Read, counted, never changed. |

Migrations: `prisma/migrations/20260916T140000_the_control_room` and
`20260916T170000_the_bill_and_the_clock` (the four tables above, and the rebuilt days).

`AiCall` and `UsageDay` are **kept** when an account is purged (owner, 9 Sep: the
record and the numbers survive, the person does not); they hold no text. `AppSession`
and `ServerRun` hold no account at all. `MemberDay` and `MemberOrigin` are purged
with the account.

## API

| Call | Who | Returns |
|---|---|---|
| `GET /api/insights/investor?section=…&range=…` | investor password header | one section |
| `GET /api/insights?section=…&range=…` | signed in, `analytics.read` | one section, founder view |
| `POST /api/insights/origin` | signed in | 204; records where the member came from, once |
| `POST /api/insights/beat` | signed in, 10 a minute | 204; `{ s }` seconds on screen since the last beat |
| `POST /api/insights/session` | public, the city's own pages only (Origin), 30 a minute | 204; `{ id, platform, crash? }` |

Sections: `overview` (snapshot, pulse, what changed, growth, journey, engagement),
`city` (systems, adoption, depth), `retention`, `reach` (sources, places, ages,
devices), `ai`, `money`, `health`, `live`. Range: `24h`, `7d`, `30d`, `90d`, `all`.
Throttled to 60 a minute.

Web: `together-city-react/src/features/insights/api.ts` exposes
`getDashboardOverview`, `getCityActivity`, `getRetention`, `getAcquisition`,
`getAIAnalytics`, `getRevenueMetrics`, `getPlatformHealth`, `getLiveActivity`.

## Export and presenting

- **CSV**: every number on the page for the chosen range, one file. Blank cells are numbers the city cannot measure yet. A sample export says so in its first line and its file name.
- **PDF**: the browser's print of the page, with a print sheet (controls and tooltips hidden).
- **Investor snapshot**: the page switched to presentation mode, then printed.
- **Present**: larger numbers, no tooltips or tables, for a screen share.

## Known limits

- Days of use before 16 Sep are rebuilt from sign-ins, messages, posts, comments, likes, calls and events, not observed; a member who only read that day is missing.
- Traffic sources cannot be rebuilt: nothing recorded them before 16 Sep. Visitors and members from before then are counted in a note under the sources table, never guessed into a row.
- AI calls, time in the app, sessions and uptime are recorded from 16 Sep (from the deploy that ships them). There is nothing earlier to read.
- AI cost needs `AI_MODEL_RATES`; until it is set the page shows tokens and says so.
- Crashes inside the phone apps' native layer (outside the web view) are not reported.
- "Right now" health figures describe the current server process only; "Across deploys" covers the window.

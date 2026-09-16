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
| Avg time per active day | Seconds in the app per member per active day, from the app's foreground heartbeat (`UsageDay`). **Not measured** until that heartbeat is recording. |

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
the day each system opened. **Days of use** are recorded from go-live of this
dashboard (the migration also backfills one day per member from their last-seen date).
The page says "Daily activity recorded from …".

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
| AI requests, tokens | From the per-call ledger (`AiCall`) once it exists; otherwise **—**. |
| AI cost, cost per member / conversation / session, monthly AI cost | Tokens × each model's price. **Not shown** until every call is metered and every model has a price; never estimated. |
| Response time and failure rate of AI calls | **Not recorded yet.** |

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

- Counted by this server process since it started (a deploy starts again):
  requests, server errors (5xx), success rate, median and p95 response time, in
  five-minute columns over the last 24 hours.
- Database: a `SELECT 1` and how long it took.
- **Not measured yet:** crash-free sessions (the apps do not report crashes), AI
  failures, uptime across deploys.

## How the numbers are captured

| Instrument | Where | What it writes |
|---|---|---|
| Member-day | `src/insights/insights.interceptor.ts` → `member-day.service.ts` | One `MemberDay` row per member per city day, with the systems used that day, on any successful signed-in request. De-duplicated in memory; one upsert per member, system and day. |
| Request stats | `src/insights/request-stats.ts` | In memory only: five-minute buckets of requests, errors and response times. |
| Visit origin | `src/analytics/visits.controller.ts`, `visit-origin.ts` | Source columns on `SiteVisitor`, on the first visit. |
| Member origin | `src/insights/member-origin.service.ts` | One `MemberOrigin` row per member, never overwritten. |
| Everything else | the systems' own tables | Read, counted, never changed. |

Migration: `prisma/migrations/20260916T140000_the_control_room`.

## API

| Call | Who | Returns |
|---|---|---|
| `GET /api/insights/investor?section=…&range=…` | investor password header | one section |
| `GET /api/insights?section=…&range=…` | signed in, `analytics.read` | one section, founder view |
| `POST /api/insights/origin` | signed in | 204; records where the member came from, once |

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

- Days of use start at go-live of this dashboard; before that, activity comes only from records members created.
- Sources start at go-live; earlier visitors and members are counted apart.
- AI cost and time in the app depend on the AI call ledger (`AiCall`) and the heartbeat (`UsageDay`), which ship separately. Until then those cards say so.
- Health figures describe the current server process only.

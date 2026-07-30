# Retention for the tabs the review removed

**Decision date:** 2026-07-30 · **Sunset for the endpoints:** 2026-08-30

The site review removed seven destinations from the Nutrition hub and one from
Social Life. This note records what happens to the rows behind them, because
"we deleted the page" and "we deleted the data" are different decisions and only
one of them is reversible.

## The decision, in one line

**Nothing is deleted.** The screens are gone, the menu entries are gone, the
endpoints are deprecated with a sunset date — and every row stays exactly where
it is.

## Why not archive to cold storage

The obvious instinct is to move these rows somewhere cheap. We are not doing
that yet, for two reasons.

The first is that it would be work with no benefit today. The volume is small,
the tables are already indexed by citizen, and moving them to another store
would mean writing and testing an export path, a restore path and a second
access-control surface — all to save an amount of disk that does not register
on the bill.

The second is that it would put health data behind a second door. `MealPlan`,
`NutritionHistory` and the blood-derived targets they reference are health
records. They are covered by the purge plan in `src/privacy/purge-plan.ts`, by
the encryption and audit work in §16, and by the account-deletion path a citizen
can already exercise. An archive copy would need every one of those guarantees
rebuilt around it, and a copy of a health record that a delete request misses is
the worst outcome available.

So: cold storage becomes worth doing when volume makes it worth doing, and at
that point it is one migration against tables that have not moved. Until then,
leaving the rows in place is both cheaper and safer.

## What this means per module

| Data | Model | Still written? | Still readable? |
|---|---|---|---|
| Weekly plan history | `NutritionHistory` | yes — the weekly planner survives | yes, via `/api/nutrition/plan` |
| Meal plans | `MealPlan`, `MealPlanDay` | yes | yes |
| Grocery orders | `NutritionOrder`, `NutritionOrderItem` | no new orders from the UI | yes, until the sunset date |
| Supplement suggestions | computed, not stored | n/a | via the Fitness hub |
| Pantry | `PantryItem`, `PantryConsumption` | yes — the Family hub keeps its pantry | yes |
| Pinned post locations | `Post.lat` / `Post.lng` | yes — the composer still pins | on the post itself, not on a map |

Two rows in that table are the reason this note exists rather than a delete
migration. Pantry looked like a removal and is not: the review removed the
*individual* pantry tab, and the Family hub's shared pantry reads the same
tables. Nutrition history looked like a removal and is not: the tab is gone but
the weekly planner reads the same records to show you last week.

Deleting either would have taken working features down with the menu entries.

## The endpoints

Six routes are marked `@Deprecated(...)` (see `src/shared/deprecated.decorator.ts`):

- `GET /api/nutrition/history` → `/api/nutrition/plan`
- `GET /api/nutrition/supplements` → `/api/fitness/supplements`
- `GET /api/nutrition/dietitians` → `/api/medical/consults`
- `POST /api/nutrition/dietitians/:id/book` → `/api/medical/consults`
- `GET /api/nutrition/orders` → `/api/nutrition/grocery`
- `GET /api/social/map` → `/api/social/feed`

Each answers normally and adds `Deprecation`, `Sunset` and `Link` headers, and
each call is logged under the `Deprecated` context. They come out after
2026-08-30 — but the decision to remove them should be made by reading that log,
not by reading this date. If a client is still calling on the 29th, the date
moves.

## Account deletion is unaffected

Every model above is already classified in `src/privacy/purge-plan.ts`, and
`purge-plan.spec.ts` fails the build if a citizen-linked model is not. Removing
a tab does not change what a delete request removes, which is the point of
keeping the rows where the purge plan can already see them.

# E-Commerce — the city's shops, in one district

Two rooms behind one facade, added 22 Aug on the owner's word.

| Room | Path | What it is |
|---|---|---|
| Personalized Store | `/ecommerce/store` | The shelves that read a profile and answer with a shortlist |
| Open Market | `/ecommerce/market` | The same shops, by category, with nothing ranked for you |

## What this district is, and what it is not

It sells nothing of its own. There is no product table in the API — `commerce`
is the payments module — and no catalogue in this folder. The city already had
five shops built over months, each verified by the hub that owns it; nothing
said they were one shop, so nobody could see them as one. This district is the
door to all of them.

That constraint is not a limitation of a first version. E-Commerce was
**deleted** on 10 Aug for being "the only district without a hub" — a
photograph of a shop that did not exist with COMING SOON across it. Filling
these two pages with an invented shelf would be the same mistake with better
art.

## The copy is not written here

Every card's name and line is read out of `HUBS[hub].items` — the sidebar entry
of the room it points at. `shelves.ts` names paths and categories only. A shelf
whose path stops resolving drops out of the rendered list, and
`src/app/the-shop-is-the-citys-own-shelves.test.ts` fails when one does.

## Footprint outside this folder

| File | Edit |
|---|---|
| `src/types/index.ts` | `ecommerce` joins `HubKey` |
| `src/config/hubs.ts` | the street tab (A–Z, between Dating and Entertainment) + the two-room config |
| `src/app/router.tsx` | the `/ecommerce` landing + one `HubLayout` block over `ecommerceRoutes` |
| `src/pages/HubLanding.tsx` | `HUB_HERO` and `HUB_LINE` |
| `src/nav/registry.ts` | `HUB_ICON` → `product` |
| `src/pages/Home.tsx` | the walk plate + its billboard copy |
| `src/styles/layout.css` | the `.ec-*` block — no new token, no new depth, no colour literal |
| `public/assets/img/` | `e-commerce.webp` (1915×821) and `e-commerce-tile.webp` (448×280) |

No phone poster yet: `HUB_PORTRAIT` has no entry, so a phone falls back to the
landscape plate — a plainer landing, never an empty frame.

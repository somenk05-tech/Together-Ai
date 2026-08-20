# Pet District — `src/features/pets`

The Pet hub for Together City: profiles, a veterinary-sourced feeding engine, a
weekly planner, an ingredient-safety desk, home-cooked recipes, a 184-product
Indian marketplace, wellness, activity and services.

Written to drop into `together-city-react` as it stands: TypeScript, inline
styles reading `tokens.css` variables only, `zustand` for state, `react-router`
for routes, and no new dependencies.

---

## Wiring it in — four edits, none of them destructive

**1 · Routes.** In `src/app/router.tsx`, add the landing beside the other hub
landings and the rooms as a `HubLayout` block:

```tsx
import { petsRoutes } from '@/features/pets/routes';

// beside the other landings, inside the AppShell children:
{ path: '/pets', element: <HubLanding hub="pets" /> },

// as a sibling HubLayout block, next to the Beauty one:
{
  element: <HubLayout hub={HUBS.pets} />,
  children: petsRoutes,
},
```

**2 · The hub's sidebar.** `src/config/hubs.ts` already has a `pets` entry with
`items: []`. Fill it from the exported list:

```ts
import { PETS_SIDEBAR } from '@/features/pets/routes';
// …
pets: {
  key: 'pets', name: 'Pet Care', tag: 'Everything your pet needs, in one place',
  backPath: '/pets', items: PETS_SIDEBAR,
},
```

**3 · The street tab.** Add to `NAV` in `src/config/hubs.ts`, in alphabetical
position (between Nutrition and Personal):

```ts
{ key: 'pets', label: 'Pets', path: '/pets' },
```

**4 · The hero.** `src/pages/HubLanding.tsx` maps a hub to its commissioned art.
Drop the district plate at `public/assets/img/pets-hub.webp` and add:

```ts
pets: 'pets-hub.webp',
```

and the street-level line:

```ts
pets: 'Everything your pet needs. All in one place.',
```

Until that file exists the hub draws its own night-street scene, so nothing is
broken while the art is in production.

---

## What this does NOT touch

`tokens.css` is unchanged. Not one line.

That is deliberate, and it is the answer to a real tension. The brief asked for
a dark, glassy, cinematic pet world; `relief.spec.ts` grants a re-pointed ground
to astrology, beauty and entertainment, and Pets is not one of them. Rather than
spend that argument, the cinema lives in the **plate** — a full-bleed hero that
ends — and the tools below it run on the city's white paper with the amber lamp
`tokens.css` already grants this hub. Nothing here introduces a token, a sixth
depth, a second typeface or a hex literal in a `.tsx` file.

If you later decide Pets should be a grounded hub, the argument to write into
the spec's rationale comment is that a district whose whole subject is
photography of animals has the same claim entertainment does — and the work is
then a `[data-hub="pets"]` block plus an AA check on every ink, not a rewrite of
these pages.

---

## The shape of it

```
data/        catalogue.ts     184 real products, every one with a source URL
             ingredients.ts   51 Indian ingredients + 32 never-feed foods
             composition.ts   56 foods, IFCT 2017 (NIN/ICMR) and a USDA mirror
             evidence.ts      every energy constant with the page it came from
             recipes.ts       14 home-cooked recipes, all complementary
             breeds.ts        size and life-stage reference, Indie breeds first
             bundles.ts       8 kits assembled from real catalogue rows
             services.ts      SAMPLE listings, labelled as such in the UI
             samplePets.ts    two pets so the hub can be read before a form

engine/      nutrition.ts     RER / MER, portions, treats, water, meal times
             plan.ts          today and the week, built from the above
             recommend.ts     product suggestions, each with its reason
             shopping.ts      the week's list, split shop vs kitchen
             subscription.ts  run-out estimation, and honest when it can't
             scorecard.ts     the eight-dimension pet scorecard
             naming.ts        brand-name de-duplication

api.ts       the seam. Every page reads through these hooks; when the NestJS
             endpoints land, this file changes and the pages do not.

store.ts     zustand, in memory. No localStorage — a pet profile belongs on the
             server behind the citizen's account, not in one browser.
```

---

## The rules the code keeps

**A number without a source is not written.** 12 of 184 products have no
confirmed price and 174 have no published guaranteed analysis, because Indian
retail listings largely do not publish one. Those states are `null` plus a
`verified` flag, and the UI says "price not verified at source" and "the pack
carries the analysis" rather than inventing a figure. `portionFor()` returns
`null` when a food's kcal/kg is unknown, and the meal card prints the pack's own
feeding guide.

**Complete and complementary are never blurred.** Every home-cooked recipe is
`complementary`, on the evidence of Stockman et al. (JAVMA 2013, UC Davis): 95%
of 200 home-prepared dog recipes were deficient in at least one essential
nutrient. The badge is on the recipe card, the meal card, the planner and the
section header.

**One feeding engine.** Merck's RER-multiplier method throughout — never blended
with WSAVA/FEDIAF's NRC-2006 direct equations, which are a different system.
Weight-loss plans compute on ideal body weight at 80% of ideal-weight RER, per
AAHA. Every constant is in `data/evidence.ts` with its quote and URL.

**Nothing diagnoses.** Veterinary diets and parasiticides are in the catalogue
because owners need to find them, and they carry a vet-guidance flag everywhere
they appear. No product page claims a product treats or prevents anything.

**Retailer photography is not republished.** `imageUrl` is held for catalogue
research; the shelf draws its own pack shapes. Clearing images is a merchant
conversation — see sheet 14 of the data workbook.

---

## Verified against

| Area | Sources |
|---|---|
| Products, prices, pack sizes | Supertails, Heads Up For Tails, Zigly (fetched 19 Aug 2026) |
| Ingredient and toxicity verdicts | Merck Veterinary Manual, ASPCA APCC, VCA, Pet Poison Helpline, AVMA, Cornell Feline Health Center, vet-reviewed PetMD |
| Energy equations and factors | Merck Veterinary Manual, AAHA 2014/2021 weight-management guidelines |
| Treat ceiling, water, body condition | UC Davis VMTH, Cornell Riney Canine Health Center, WSAVA |
| Food composition | Indian Food Composition Tables 2017 (NIN/ICMR); USDA SR/FNDDS mirror for 12 foods |

---

## Known gaps, stated rather than hidden

- **Nutrition data is thin** — 10 of 184 products publish a guaranteed analysis.
  The product works without it; the fix is merchant data feeds, not more scraping.
- **Services are sample rows.** The real directory is a join to Local Services.
- **Species beyond dogs and cats are stubs.** Birds, rabbits, guinea pigs and
  fish are in the schema and named in the UI as not yet built. A rabbit is a
  hindgut fermenter and a guinea pig has a dietary vitamin C requirement —
  neither is a variation on a dog.
- **Checkout is not wired.** Payments belong to the city's Pay service.
- **State is in memory.** `api.ts` is where the server replaces it.

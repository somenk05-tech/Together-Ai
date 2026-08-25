# The City Is Made Crawlable — SEO Engine, 25 Aug

Artifact (styled): https://claude.ai/code/artifact/363563a5-bbec-4478-a77d-e45b1ea564da

Together City · SEO engine

1.  [**00**Where the city stands](#state)
2.  [**A**SEO architecture](#a)
3.  [**B**Entity map](#b)
4.  [**C**Keyword universe](#c)
5.  [**D**Programmatic pages](#d)
6.  [**E**App blueprints](#e)
7.  [**F**Internal link graph](#f)
8.  [**G**Technical requirements](#g)
9.  [**H**GEO / AEO](#h)
10. [**I**Priority roadmap](#i)
11. [**J**Scorecard](#j)
12. [**K**Automation & QC](#k)

# Search query → Together City → right hub → right app → *user action*

The SEO information architecture for togethercity.app, built from the routes, hub config and data the app actually ships — not the hub list in the brief.

25 Aug 2026 · source: together-city-react/src (router, config/hubs.ts, features/\*), together-city-chat/prisma, live togethercity.app · no search volumes or rankings are stated as fact anywhere on this page

**The one-sentence diagnosis.** Together City has ~200 web routes, 132 database models and a real, sourced product behind most doors — and Google can see exactly one page of it. Every URL serves the same static `index.html` with the same title, no canonical, no sitemap, and an empty ``. 154 routes sit behind `RequireAuth`. The job is not "add keywords"; it is to build a *public press layer* — crawlable, prerendered pages for every hub, every room and every first-party dataset — that hands the visitor into the signed-in app at the same URL.

## 00Where the city stands today

### What actually exists (the real taxonomy)

Sixteen hubs are configured in `config/hubs.ts`; fourteen are on the header, two (Travel, Financial) are live but off the street. Mira is chrome, not a hub — present on every route via `/chats?c=__mira__`. "Personal" is a drawer, not a district.

| Hub                | Public landing | Rooms (menu)                                                                                                                                  | Indexable first-party data behind it                                                                                                                                |
|--------------------|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Astrology Zone     | /astrology     | Today, This Month, Ask the Astrologer, Tarot, Gemstones, Checkout, Remedies, Profile                                                          | Gemstone marketplace (per-stone design studio `/astrology/gemstones/:gemId/design`), tarot deck, remedies                                                           |
| Nutrition Hub      | /nutrition     | Blood test, Preferences, Weekly Planner, Grocery, Recipes, AI Food Journal, Saved                                                             | `Recipe` + `RecipeIngredient` models; 4,718 recipe images shipped in `/public/recipe-images`; per-recipe route `/nutrition/recipes/:id`                             |
| Family Nutrition   | /family        | Connect, Weekly, Grocery, Search by ingredients                                                                                               | Shares the recipe corpus                                                                                                                                            |
| Pet Care           | /pets          | Pet world, Profiles, Diet plan, Today, Monthly, Can my pet eat this?, Cook, Shop, Specialist, Compare, Bundles, Wellness, Activity, Scorecard | 83 ingredient verdicts (51 foods + 32 never-fed) with vet sources, dog/cat; 26 breeds; 491-line product catalogue with source URLs; 51 home-cooked recipes; bundles |
| Beauty Market      | /beauty        | Skin & Hair Profile, Your Beauty Routine, Beauty Market, Orders (Makeup Studio hidden)                                                        | 29-brand verified shelf; routine engine; budget engine                                                                                                              |
| Fitness            | /fitness       | Profile, Body Goal, Workout, Log, Supplements, Sleep, The Store, Orders                                                                       | Supplement catalogue across 10 categories; workout plans                                                                                                            |
| Medical Hub        | /medical       | Blood analysis, Order tests, Records, Talk to a doctor, Timeline, Family, Consent, Medicines                                                  | Blood-marker analysis with citations; medicine reminders. Most rooms are personal and must stay out of the index                                                    |
| Dating Hub         | /dating        | Profile, Potential Matches, Curated Matches, Chats (Activity dating hidden)                                                                   | Compatibility engine (astrology 0.50 weight). No indexable records — people are never pages                                                                         |
| Jobs Hub           | /jobs          | Resume & Profile, Jobs for you, Applications, Post a Job, Postings                                                                            | `Job` (first-party postings) and `ExternalJob` (from the web)                                                                                                       |
| Local Services     | /services      | Find, List, Mine, Regulars, Offers, Messages, Orders                                                                                          | `ServiceListing`, reviews, menu items, offers — citizen-created, empty on day one                                                                                   |
| Real Estate        | /realestate    | Explore, Under Construction, List, Mine                                                                                                       | `Property` listings `/realestate/property/:id`; RERA data on under-construction                                                                                     |
| E-Commerce         | /ecommerce     | Personalized Store, Open Market, Cart                                                                                                         | No catalogue of its own — a door onto beauty, supplements, gemstones, pets shops                                                                                    |
| Entertainment      | /entertainment | Movies Now, OTT Watch, Curated, Watchlist                                                                                                     | Third-party movie data — low differentiation                                                                                                                        |
| Social Life        | /social        | City Feed, Profile, Saved                                                                                                                     | UGC posts, public handles `/social/u/:handle`                                                                                                                       |
| Mail               | /mail          | Inbox, Compose, …, Drive                                                                                                                      | Private. Disallowed in robots.txt already                                                                                                                           |
| Financial District | /financial     | Wallet, Spending, Budgets, Transactions, Invoices                                                                                             | Private ledger. Product page only                                                                                                                                   |
| Travel Hub         | /travel        | Explore, Flights, Packages, Bookings, Trips                                                                                                   | Packages `/travel/package/:id`; hub is hidden from nav — do not build SEO on it until it is back on the street                                                      |

### Technical findings (verified against the repo and the live site)

criticalPure client-side render. `vercel.json` rewrites `/(.*)` to `/index.html`; the crawler receives an empty root div. Googlebot renders JS but slowly, unreliably and with no per-route metadata to work from; every AI answer engine gets nothing.

criticalOne title and one description for ~200 URLs ("Together City — Everything. Personalized."). The comment in `index.html` says so honestly: "per-route tags would need SSR".

criticalNo canonical anywhere (correctly omitted — a single static canonical would de-index everything). No `sitemap.xml`: the URL returns the app shell with HTTP 200 — a soft 404. Same for any typo URL: `/index.html` is a live route, `*` renders NotFound at 200.

high154 of ~200 routes are behind `RequireAuth`, including every room that carries the product's actual value (planner, recipes, gemstones, pet shop, blood analysis). Only `/`, the 16 hub landings, `/about`, `/help`, `/contact`, `/legal/*` and the auth pages are public.

highHub landings render a headline line each ("Your food, personalized to you.") and a poster. No H1 hierarchy, no explanatory copy, no room list a crawler can follow, no schema.

mediumViewport lock (`maximum-scale=1, user-scalable=no`) fails WCAG 1.4.4 and is flagged by Lighthouse; it was an owner decision on 10 Aug, but it costs a Core Web Vitals / accessibility signal and iOS ignores it anyway.

good`robots.txt` already disallows the private rooms (chats, mail, personal, daybook, thoughts, profile, settings, console, moderation, dev). HSTS preload, CSP, referrer policy are set. OG/Twitter card exists site-wide. Hub landings are already public routes — the press layer has a place to stand.

goodThe data is unusually SEO-grade for a startup: every pet verdict names its veterinary source; every product carries a source URL; the copy discipline refuses claims the product cannot keep. This is exactly what AI answer engines reward.

## ASEO architecture

Two layers, one URL space. The **press layer** is what a signed-out visitor and a crawler get: prerendered HTML at build time (or SSR at the edge), with title, description, H1, body copy, schema and links. The **app layer** is what a citizen gets after sign-in: the same URL, the React room. No `/seo/` ghetto, no duplicate URLs, no personalised states exposed to crawlers.

TOGETHER CITY (togethercity.app) │ ├── / Home · Organization + WebSite schema · the 14 doors ├── /about /help /contact Info · already public, need real copy + FAQ │ ├── HUBS (pillar pages — exist, need content) │ /astrology /nutrition /family /pets /beauty /fitness /medical │ /dating /jobs /services /realestate /ecommerce /entertainment /social │ (/travel /financial: live but off-street — noindex until back on nav) │ ├── ROOMS (app pages — press render when signed out, app when signed in) │ /nutrition/weekly /nutrition/journal /pets/eat /pets/plan │ /astrology/gemstones /astrology/tarot /beauty/routine /fitness/workout │ /medical/blood /jobs/matches /services/browse /realestate/explore … │ (≈ 60 rooms qualify; personal/ledger rooms stay noindex) │ ├── RECORDS (first-party datasets — programmatic, one page per real record) │ /nutrition/recipes/:slug Recipe schema │ /pets/eat/:species/:food "Can my dog eat X?" · 83 foods × dog/cat │ /pets/cook/:slug 51 recipes │ /pets/shop/:slug catalogue items with source URLs │ /astrology/gemstones/:gem stones (+ /design studio gated) │ /services/:id LocalBusiness · citizen listings │ /realestate/property/:id RealEstateListing · live only │ /jobs/:slug JobPosting · first-party posts only │ /travel/package/:id when Travel returns │ ├── DISCOVERY (intent → app; Mira's map, made public) │ /ask "What can Mira do?" — the intent index │ /ask/\[intent\] one page per curated intent cluster │ /best/\[audience-or-task\] "best AI for…" only where the city has the product │ /compare/\[a\]-vs-\[b\] only within-city or vs. a category, never vs. a named rival │ └── GUIDES (topical authority; editorial, not programmatic) /guides/\[hub\]/\[topic\] e.g. /guides/pets/what-indian-dogs-can-eat

### Rules that keep the tree honest

- A URL is indexable only if its signed-out render contains content that answers the query without signing in. A room whose press render is "Sign in to see your plan" is `noindex`.
- Records are pages only when the record is first-party or sourced. External jobs (`ExternalJob`) are never given pages; first-party `Job` postings are.
- People are never pages. `/social/u/:handle` and every dating surface stay `noindex` regardless of demand.
- Hidden hubs (Travel, Financial) are `noindex` until they are back on the street; a hub that is not shown to citizens should not be shown to Google.
- One canonical per record. The e-commerce mirrors (`/ecommerce/shop/beauty`, `/ecommerce/market/gemstones`) canonicalise to the owning hub's room.

## BEntity map

The graph an answer engine needs to hold in its head. Every arrow is a real internal link in the press layer, and every node has one canonical URL.

Together City ─ is a ─ personalised life platform (one profile → 14 hubs) │ ├─ has assistant ─ Mira ─ can ─ \[balance, transactions, documents, restaurants, navigate\] (+ each @Mira() route) │ ├─ has hub ─ Pet Care │ ├─ has capability ─ "Can my pet eat this?" ─ answers ─ 83 foods × {dog,cat} │ │ └─ cites ─ Merck, ASPCA, VCA, Pet Poison Helpline, AVMA, Cornell, PetMD │ ├─ has capability ─ Diet plan ─ uses ─ breeds(26), composition, density │ ├─ has capability ─ Cook for my pet ─ has ─ 51 recipes │ ├─ has marketplace ─ Pet shop ─ lists ─ Indian products with source URLs │ └─ for audience ─ Indian dog & cat owners │ ├─ has hub ─ Nutrition │ ├─ has capability ─ Weekly Meal Planner ─ reads ─ preferences, allergies, blood test │ ├─ has capability ─ AI Food Journal ─ does ─ photo → logged & counted │ ├─ has records ─ Recipes ─ each ─ ingredients, veg mark, cuisine │ └─ relates to ─ Family Nutrition (portioned per member) · Fitness (body goal) · Medical (blood) │ ├─ has hub ─ Astrology │ ├─ has capability ─ Daily / Monthly letter · Ask the Astrologer (paid) · Tarot │ ├─ has marketplace ─ Gemstones ─ prescribed from ─ birth chart ─ sold by ─ the carat │ └─ relates to ─ Dating (astrology = 0.50 of match weight) │ ├─ has hub ─ Beauty ─ routine ← profile + budget ← allergies from Nutrition ("we left the almond oil out") ├─ has hub ─ Fitness ─ body goal integrates diet + workout + health · store: verified in India, no cut ├─ has hub ─ Medical ─ blood analysis (cited) · medicines & reminders · family profiles ├─ has hub ─ Dating ─ curated 3–5/day · multi-dimensional compatibility · explainable matches ├─ has hub ─ Jobs ─ upload CV once → ranked matches · post a job ├─ has hub ─ Local Services ─ citizen businesses · anonymous messages · wallet-paid orders ├─ has hub ─ Real Estate ─ explore · under-construction with RERA · list a property ├─ has hub ─ E-Commerce ─ personalised store (Mira picks, fit score) · open market ├─ has hub ─ Entertainment · Social Life · Mail · Financial (wallet) · Travel (hidden) │ └─ cross-hub mechanism ─ "Tell it once" ─ profile facts travel between hubs

The differentiating entity is the last line. No competitor in any single category can claim that a nut allergy told to the meal planner keeps almond oil out of skincare. That mechanism is what the home page, the About page and every hub pillar must state plainly, because it is the fact an AI assistant will repeat when asked "what is Together City".

## CKeyword universe

Demand tiers below are qualitative judgements of the query *class* (High / Medium / Low / Niche), not numbers. Confirm with Search Console once the press layer is live and with Keyword Planner (India, English + Hinglish) before committing editorial budget. Nothing here is a volume.

### Clusters by hub, organised by intent

| Hub / app                                       | Core                                                                                 | Problem & use-case                                                                                   | Question (AEO)                                                                     | Comparison / commercial                                                    | Demand                                                                                    |
|-------------------------------------------------|--------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|----------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| **Pets · Can my pet eat this?**                 | can dogs eat \[food\], can cats eat \[food\], is \[food\] safe for dogs              | dog ate \[toxic food\] what to do, foods toxic to dogs india, human food dogs can eat indian         | "Can my dog eat roti / dal / paneer / curd / tamarind?" "Is sambar safe for dogs?" | best dog food india, dog food comparison, pedigree vs royal canin          | High (the Indian-food long tail is underserved)                                           |
| **Pets · Diet plan / Cook**                     | homemade dog food recipes india, dog diet chart, cat diet plan                       | how much to feed a \[breed\], indie dog diet, puppy feeding schedule                                 | "How much should my labrador eat per day?"                                         | homemade vs commercial dog food, best pet food brands india                | Medium–High                                                                               |
| **Nutrition · Weekly Meal Planner**             | AI meal planner, weekly meal plan india, personalised diet plan                      | meal plan for \[condition/goal\] indian, diet plan based on blood test, meal planner for nut allergy | "What should I eat this week if I'm vegetarian and want to lose weight?"           | best meal planning app india, meal planner alternative, free AI diet plan  | High                                                                                      |
| **Nutrition · Recipes**                         | \[dish\] recipe, healthy \[dish\], high protein indian recipes                       | recipes without \[allergen\], low sodium indian dinner                                               | "Is \[dish\] vegetarian / high protein?"                                           | —                                                                          | High but crowded; win on filters the profile provides (allergen-safe, veg mark, calories) |
| **Nutrition · AI Food Journal**                 | AI food journal, photo calorie counter, food photo calorie app                       | track calories from photo india food                                                                 | "How many calories in a plate of rajma chawal?"                                    | healthifyme snap alternative, best calorie counter app india               | High                                                                                      |
| **Family Nutrition**                            | family meal planner, meal plan for whole family                                      | one dinner different diets, feeding family with diabetic parent                                      | "How do I plan meals for a family where everyone eats differently?"                | —                                                                          | Medium, weak competition                                                                  |
| **Astrology · Gemstones**                       | gemstone for \[rashi/planet\], which gemstone should I wear, blue sapphire benefits  | gemstone recommendation by birth chart, ratti/carat calculator                                       | "Which stone is mine according to my kundli?"                                      | certified gemstones online india, gemstone price per carat, natural vs lab | High, commercial                                                                          |
| **Astrology · Today / Monthly / Ask / Tarot**   | daily horoscope, monthly horoscope \[sign\], tarot reading online, ask an astrologer | personalised horoscope birth chart, tarot card of the day                                            | "What does my chart say about this month?"                                         | astrotalk alternative, online astrologer consultation price                | Very high, very crowded; the letter (not a sign-based horoscope) is the differentiator    |
| **Beauty · Routine / Market**                   | AI skincare routine, skin analysis app, personalised skincare india                  | skincare routine on a budget, routine for \[skin type\] india, allergy-safe skincare                 | "What skincare routine can I afford for ₹2,000 a month?"                           | best skincare apps, nykaa vs, skincare brands india list                   | High                                                                                      |
| **Fitness · Body Goal / Workout / Supplements** | AI workout plan, body goal calculator, supplement recommender                        | workout plan for \[goal\] at home, which supplements do I need                                       | "Do I need creatine?" "How much protein for my weight?"                            | cult.fit alternative, best whey protein india                              | High                                                                                      |
| **Medical · Blood test analysis**               | blood test report analysis, understand my blood report, CBC explained                | what does high \[marker\] mean, blood report to diet plan                                            | "Is my vitamin D level low?"                                                       | practo/1mg/healthians report interpretation                                | High — YMYL, cite everything, no diagnosis language                                       |
| **Dating**                                      | compatibility-based dating app, astrology dating app india                           | dating app without endless swiping, dating app with fewer matches                                    | "Is there a dating app that only shows a few matches a day?"                       | hinge vs bumble alternative, kundli matching dating                        | Medium; product pages only                                                                |
| **Jobs**                                        | upload resume get job matches, AI job matching india                                 | jobs matched to my CV, post a job free                                                               | "Which jobs fit my resume?"                                                        | naukri alternative                                                         | Medium; postings pages for first-party jobs only                                          |
| **Local Services**                              | \[trade\] near me, electrician in \[area\], home tutor \[area\]                      | book a plumber online, list my business free                                                         | "Who fixes ACs in \[area\]?"                                                       | urban company alternative                                                  | High, local — grows only with real listings                                               |
| **Real Estate**                                 | flats for sale in \[area\], under construction projects \[city\] rera                | book a site visit online, list property free                                                         | "Is this project RERA registered?"                                                 | 99acres / housing / magicbricks alternative                                | High, local — listing-dependent                                                           |
| **E-Commerce · Personalised store**             | personalised shopping AI, AI shopping assistant india                                | shop that knows my allergies, supplements matched to my profile                                      | "Which products actually suit me?"                                                 | —                                                                          | Low as a category; value is in the hub shops                                              |
| **Mira / the city**                             | together city, together city app, mira assistant                                     | AI personal assistant for life admin, one app for health fitness food                                | "What is Together City?" "What can Mira do?"                                       | together city vs \[category apps\], super app india                        | Navigational now; brand grows with the rest                                               |

### Semantic entities the press layer must name consistently

Together City · Mira · hub (never "module") · room (never "feature page") · profile / "tell it once" · city wallet · citizen (the product's word for user) · Indian household foods (roti, dal, paneer, curd, sambar, imli) · rashi / kundli / birth chart · RERA · ratti and carat · veg mark. Use the citizen's words, per the copy deck: "the nut thing", "my blood test", not "dietary restriction" or "biomarker panel".

## DProgrammatic SEO opportunities

Only sets where every generated page is backed by a distinct first-party record with enough content to answer the query alone. Each set is scored on the rubric in section J; the gate for generation is 70.

| Template                    | Backed by                                                                 | Pages                                                                                                                     | Why each page is not thin                                                                                                                                                                           | Schema                                                            | Score | Priority                        |
|-----------------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------|-------|---------------------------------|
| /pets/eat/{dog\|cat}/{food} | 83 ingredient verdicts, each with verdict, reason, sources, Indian name   | ≈166                                                                                                                      | Verdict differs by species; each carries its own vet citation and an Indian-kitchen context (tamarind, sambar onion) no international list has                                                      | Article + FAQPage (one Q, the real one) + BreadcrumbList          | 88    | P0 |
| /nutrition/recipes/{slug}   | `Recipe` model, ingredients, images                                       | thousands (gate on completeness: image + ingredients + method + nutrition)                                                | Structured nutrition, veg mark, allergen flags, "swap for your profile" CTA. Publish only complete records; the rest stay app-only                                                                  | Recipe + BreadcrumbList                                           | 75    | P1 |
| /pets/cook/{slug}           | 51 home-cooked pet recipes                                                | 51                                                                                                                        | Species, portion by weight, composition data                                                                                                                                                        | Recipe (suitableForDiet omitted; not a human recipe) — or Article | 76    | P1 |
| /astrology/gemstones/{gem}  | Gemstone data sheet; sold by the carat                                    | tens                                                                                                                      | Planet, prescribing rule, metal, sizing, price-per-carat band that the till actually charges. Never invent benefits claims beyond what the sheet says                                               | Product (offers only if live price) + BreadcrumbList              | 80    | P0 |
| /pets/shop/{slug}           | Catalogue with source URL per product                                     | hundreds                                                                                                                  | Only where the record has price, availability, source; otherwise noindex                                                                                                                            | Product                                                           | 72    | P1 |
| /services/{id}              | `ServiceListing` + reviews + offers                                       | grows with citizens                                                                                                       | Index only verified, open listings with a description and an area; close → 410 or noindex                                                                                                           | LocalBusiness + Review (real, from ServiceReview)                 | 71    | P1 |
| /realestate/property/{id}   | `Property`                                                                | grows with citizens                                                                                                       | Live listings with photos, area, price; closed listings noindex (already deletable)                                                                                                                 | RealEstateListing / Offer                                         | 73    | P1 |
| /jobs/{slug}                | First-party `Job` only                                                    | grows                                                                                                                     | Google Jobs eligibility needs full description, location, date, org. `ExternalJob` is never indexed (aggregator duplicate)                                                                          | JobPosting                                                        | 70    | P2    |
| /ask/{intent}               | Mira's `@Mira()` capability registry, curated into ~40–80 intent clusters | ≈60                                                                                                                       | Each page: the plain-language intent, which hub answers it, what Mira does, what she refuses to do, and the door. Generated from the registry so it cannot promise a capability that does not exist | WebPage + FAQPage (where the page is literally Q→A)               | 75    | P1 |
| /best/{audience}            | Hand-curated; only where ≥3 city apps genuinely serve the audience        | ≤12 (pet owners, new parents, vegetarians, people with a nut allergy, people reading a blood report, first-time renters…) | Editorial, one per audience, rewritten when the product changes                                                                                                                                     | ItemList                                                          | 71    | P2    |

### Deliberately not generated

- `/pets/eat/{breed}/{food}` — the verdict does not change by breed; that is a doorway set.
- Per-sign daily horoscope pages (`/astrology/today/aries`) — the product is a letter from a chart, not a sign horoscope; generating sign pages would rank for a promise the app does not make.
- Movie / OTT pages — third-party data, no first-party angle.
- Any `/compare/{us}-vs-{named-competitor}` — brief allows it only if objective; the city has no verifiable comparative data, so only category comparisons ("Together City vs. using six apps").
- Recipe × diet × cuisine combinations, city × trade combinations with no listings, audience × hub grids.

## EApp SEO blueprints

The exact press-layer structure for the six highest-value apps. Every one keeps the interface central: the press render is the explainer above and around a live "open the room" CTA; signed in, the same URL is the room.

### 1 · Can my pet eat this? — /pets/eat and /pets/eat/dog/tamarind

IntentInformational, urgent ("my dog just ate…"), Indian kitchen context

Primary keywordcan dogs eat tamarind (per page) · "can my dog eat this" (index page)

SEO titleCan dogs eat tamarind (imli)? Verdict from vet sources — Together City

Meta descriptionTamarind shares the tartaric acid behind grape toxicity and is in sambar, rasam and chutney. What the veterinary sources say for dogs and cats, and what to do next.

H1Can dogs eat tamarind?

Above the foldVerdict badge (AVOID / LIMIT / OK) · one-sentence reason · "Ask about another food" input (the live tool) · species toggle

BodyWhy (the sourced reason) · Where it hides in an Indian kitchen · If your dog already ate it · Sources (linked) · Where sources disagree (say so) · Related foods · Related rooms: Diet plan, Cook for my pet, Pet specialist

SchemaArticle (author: Together City, citations as `citation`), BreadcrumbList; FAQPage only for the single real Q&A

Canonical / indexSelf · index. Species pages are distinct; do not canonicalise cat → dog

Links in/pets pillar, the /pets/eat index, sibling foods, the pet recipes that use the ingredient, /guides/pets/…

Links out/pets/plan, /pets/cook/{recipe}, /pets/specialist, /pets

Score88 — P0

### 2 · Weekly Meal Planner — /nutrition/weekly

IntentCommercial-informational: "AI meal planner india", "diet plan based on blood test"

SEO titleAI Weekly Meal Planner that reads your allergies, goals and blood test — Together City

Meta descriptionA seven-day Indian meal plan built from your food preferences, allergies and (if you connect one) your blood test — with the grocery list built from it. Tell it once.

H1A week of meals planned from your own profile, not the average person's

Above the foldWhat it does / who it is for / what you get (plan → grocery list → order) · "Build my week" CTA (sign-in) · a real sample day rendered from the press engine, labelled as a sample

BodyHow it works (preferences → blood → plan → grocery) · What it refuses to guess (no numbers from somebody else's body) · Family version · Own recipes change shelves · FAQ (real questions from the audit docs: "Can I swap a meal?", "Does it handle a nut allergy?") · Related: Recipes, Food Journal, Family, Fitness body goal, Medical blood

SchemaSoftwareApplication (applicationCategory: HealthApplication, offers: free tier only if true) + BreadcrumbList + FAQPage

Score84 — P0

### 3 · Gemstones — /astrology/gemstones and /astrology/gemstones/{gem}

IntentCommercial: "which gemstone should I wear", "blue sapphire price per carat"

SEO titleGemstones prescribed from your birth chart, sold by the carat — Together City

Meta descriptionOnly the stones your chart calls for — one stone, one size, priced by the carat with the metal and setting chosen in the studio. Enter your birth details once.

H1Only the stones your chart calls for

Above the foldExplain the prescribing rule in one paragraph · "Read my chart" CTA · the stone index (each linking to its page)

Stone pageStone · planet · who it is prescribed for (the rule, not a promise) · metal and finger · sizing (ratti/carat) · price band from the till · certification · Design studio CTA (gated) · Related: Remedies, Astrology profile, Beauty (never), Dating (astrology weight — one line)

SchemaProduct with Offer only when the price on the page is the live price; no aggregateRating unless real reviews exist (they do not today)

Score80 — P0

### 4 · Beauty Routine — /beauty/routine

SEO titleA skincare and hair routine built from your profile and your budget — Together City

Meta descriptionPhotos in, assessment out, and a routine from 29 verified brands that fits the money you set — leaving out what you're allergic to, because you told the kitchen. Tell it once.

H1We left the almond oil out. You told the kitchen about nuts, and we were listening.

BodyHow the budget works (a target, spent visibly) · The shelf (29 brands, verified) · What the assessment does and does not claim · Related: Beauty Market, Skin & Hair Profile, E-commerce store

SchemaSoftwareApplication + BreadcrumbList

Score78 — P0

### 5 · Blood Test Analysis — /medical/blood

SEO titleUnderstand your blood report — cited, trend-aware analysis — Together City

Meta descriptionUpload a blood report and get each marker explained with its citation and its trend against your last one — then let the meal planner read it. Not a diagnosis.

H1You've been holding that blood report for a week, haven't you.

YMYL rulesEvery marker explanation cites its source; "not medical advice" stated; no condition names in headings; Organization schema with contact; author/reviewer only if a real clinician reviews (the clinical review packet exists — name them only with consent)

SchemaMedicalWebPage is tempting — do not use it unless a named medical reviewer is on the page. WebPage + SoftwareApplication

Score76 — P1

### 6 · Mira — /ask

SEO titleMira. Just tell her. — the assistant that runs Together City

H1You never have to know which room owns the thing you want

BodyWhat Mira can do today (generated from the capability registry — balance, transactions, documents, restaurants, take you anywhere) · What she will not do (spend money, invent a path) · The intent index (/ask/{intent}) · Voice · Privacy (what Mira knows about you)

SchemaSoftwareApplication (Mira) as part of Organization; FAQPage on the "what can she do" list

Score79 — P1

## FInternal linking graph

The press layer must contain real `<a href>` links; the app's client-side navigation does not count for crawlers. Anchor text varies by context and never repeats the exact page title.

| Edge                | From → to                                                                 | Where it lives                                   | Anchor pattern                                                           |
|---------------------|---------------------------------------------------------------------------|--------------------------------------------------|--------------------------------------------------------------------------|
| City → hubs         | / → 14 pillar pages                                                       | Home door list, footer                           | hub name + its line ("Pet Care — everything your pet needs")             |
| Hub → rooms         | /pets → 14 rooms                                                          | Pillar room list (the sidebar, rendered as HTML) | room label + sub ("Can my pet eat this? — 83 Indian foods, vet-sourced") |
| Room → records      | /pets/eat → 166 verdict pages                                             | Index grouped by verdict and by category         | food name (Indian name in brackets)                                      |
| Record → siblings   | tamarind → grapes, raisins (same mechanism)                               | "Related foods" block                            | descriptive: "grapes — the same tartaric acid"                           |
| Record → capability | verdict page → /pets/plan, /pets/cook/{recipe using it}                   | Body CTA                                         | "build a diet plan that leaves it out"                                   |
| Cross-hub mechanism | /nutrition/weekly ↔ /medical/blood ↔ /beauty/routine ↔ /fitness/body-goal | "Tell it once" block on each                     | "the allergy you told the meal planner"                                  |
| Intent → app        | /ask/{intent} → room                                                      | The door                                         | the verb: "open the planner"                                             |
| Guides → apps       | /guides/pets/… → verdict pages + /pets/plan                               | In-text                                          | natural language                                                         |
| Everything → parent | room/record → hub → city                                                  | Breadcrumb (visible + schema)                    | hub name                                                                 |
| Mirror → owner      | /ecommerce/shop/beauty → /beauty/market                                   | rel=canonical, not a link                        | —                                                                        |

Authority flows downward from the home page through the pillars into the record sets; the record sets are where most entrances will happen, so every record page must carry the way back up (breadcrumb) and sideways (siblings) — no orphan verdicts.

## GTechnical SEO requirements (for engineering)

### G1 · Rendering: give crawlers HTML

Three options, in order of fit for this repo (Vite + React Router data router, Vercel):

1.  **Build-time prerender of the public surface (recommended first step).** A `scripts/prerender.mjs` gate (next to `nav-audit.mjs`) that boots the router in a headless Chromium against the built `dist/` for every public URL from a generated manifest, writes `dist/{route}/index.html` with the rendered press layer, and fails the land script if any public route renders empty. Vercel serves the static file before the SPA rewrite. Signed-in citizens hydrate into the app on the same URL. Record pages (recipes, verdicts, gems) are prerendered from a build-time export of the data — the pet data is already static TS; recipes and gems need a build-time fetch from the API.
2.  **Edge SSR for record sets that grow at runtime** (services, properties, first-party jobs): a Vercel function that server-renders the press layer for `/services/:id` etc. with 304/stale-while-revalidate. Add only when those sets have volume.
3.  Full framework migration (Next/Remix) — not recommended; the land-script gates and 279 Mira tests are built around Vite.

### G2 · Per-route head

- A `usePressHead(route)` hook (or React 19 native `<title>`/`<meta>` hoisting) sourced from one `seo/manifest.ts` — title, description, canonical, robots, OG image per route. The manifest is generated from `config/hubs.ts` + the record exports, with a hand-written override file. A test asserts every public route has a unique title and description ≤ 160 chars, mirroring `a-drawer-of-ones-own.test.ts`'s style.
- Remove the site-wide `og:url` and set it per route; keep the site-wide card as fallback only.
- Canonical: absolute, self-referential on every indexable page; e-commerce mirrors → owning room; `/index.html`, `/signin`, `/sign-in`, `/login` duplicates → 301 to one.

### G3 · Status codes and robots

- NotFound must return 404: with prerendering, Vercel serves a real `404.html` for unknown static paths; for the SPA fallback, add `<meta name="robots" content="noindex">` on the NotFound component immediately.
- `/sitemap.xml` and `/sitemap-{set}.xml` generated at build (routes, recipes, verdicts, gems) plus a runtime sitemap function for services/properties/jobs; `lastmod` from the record. Add `Sitemap:` line to `robots.txt`.
- Extend `robots.txt` Disallow to: `/dating/` (all rooms), `/social/u/`, `/*/cart`, `/*/orders`, `/*/bag`, `/financial/`, `/family/connect`, `/medical/` except `/medical` and `/medical/blood` press pages, `/console`, `/dev`, `/hubs` (gated), `/backend/`. Prefer `noindex` over Disallow for anything that is linked publicly, so the link equity still passes.
- Hidden hubs: `/travel*`, `/financial*` → `noindex,follow` until re-shown.

### G4 · URL hygiene

- Records need slugs, not ids: `/nutrition/recipes/paneer-bhurji` not `/nutrition/recipes/8123`; keep the id route as a 301. `/pets/eat/dog/tamarind`: species then food, lowercase, hyphen, ASCII; Indian names in the page, not the URL.
- No trailing slash (Vercel `trailingSlash: false`); `www` → apex 301 (verify in Vercel domain settings — could not be checked from the sandbox); HTTP → HTTPS is already forced by HSTS preload.
- Parameters: `?c=__mira__` on `/chats` is disallowed already; any `?tab=` / `?sort=` on public pages → canonical to the bare URL.
- Hreflang: single locale today. Declare `<html lang="en-IN">` and `hreflang="en-in"` + `x-default` self-references so the India targeting is explicit; add Hindi only when there is a Hindi press layer.

### G5 · Structured data

| Page            | Schema                                                                                                                                                    | Never                                   |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------|
| /               | Organization (name, url, logo, sameAs, contactPoint), WebSite (with SearchAction pointing at /ask?q= only if that public search exists), ItemList of hubs | Ratings, awards, "largest digital city" |
| Hub pillar      | WebPage + BreadcrumbList + ItemList of rooms (SoftwareApplication items)                                                                                  | —                                       |
| Room            | SoftwareApplication (operatingSystem: Web, applicationCategory, offers only if a real free/paid price)                                                    | aggregateRating                         |
| Recipe          | Recipe (image, ingredients, instructions, nutrition when computed, suitableForDiet from the veg mark)                                                     | cookTime unless stored                  |
| Pet verdict     | Article + citation + BreadcrumbList; FAQPage for the single Q                                                                                             | MedicalWebPage                          |
| Gem, product    | Product + Offer (INR, live price, availability)                                                                                                           | Reviews that do not exist               |
| Service listing | LocalBusiness + Review (from ServiceReview, real)                                                                                                         | Invented opening hours                  |
| Property        | RealEstateListing + Offer + Place                                                                                                                         | —                                       |
| First-party job | JobPosting (title, description, datePosted, validThrough, hiringOrganization, jobLocation)                                                                | ExternalJob pages                       |

Schema is generated from the same record the page renders, so it can never disagree with the visible content. A test validates every emitted JSON-LD block against the visible page (title, price, ingredient count).

### G6 · Performance and Core Web Vitals

- Prerendering fixes LCP for the press layer by itself; keep the route-level code-splitting (`ChunkBoundary`) so the hydrated app does not download every hub.
- Hub posters and recipe images: serve WebP/AVIF with width descriptors, explicit `width`/`height` to hold CLS, `loading="lazy"` below the fold, `fetchpriority="high"` on the hero.
- CSP already allows `cdn.jsdelivr.net`; audit whether any public page still loads from it (the pose model was deleted with Trainer Mode).
- Viewport lock: re-raise with the owner as an SEO/a11y cost, not a design one. If it stays, accept the Lighthouse deduction knowingly.
- Service worker (`sw.js`): make sure it never caches the prerendered HTML in a way that serves a stale press page to a crawler; network-first for documents.

### G7 · Gates (in the spirit of the repo)

    scripts/seo-audit.mjs   — every public route: unique title, description, H1, canonical, ≥1 internal link, schema validates
    scripts/prerender.mjs   — renders public manifest; fails on empty body or on a route that leaked personal data (asserts no citizen name / balance / email in press HTML)
    scripts/sitemap.mjs     — writes sitemaps from the same manifest; fails if a noindex URL is listed

## HGEO / AEO strategy

An answer engine recommends what it can describe accurately. The city's existing discipline — every line true, every claim sourced — is the strategy; the work is making it *extractable*.

### The canonical definition (put it on /, /about and in Organization.description, word for word)

Together City is a personalised web platform from India where one profile — your food preferences, allergies, goals, birth details and, if you connect it, your blood test — powers fourteen hubs: nutrition and family meal planning, pet care, beauty, fitness, medical records, astrology and gemstones, dating, jobs, local services, real estate, shopping, entertainment, social life and mail. Mira, its assistant, can take you to any of them by asking. You tell it once; every hub reads it.

### What each entity needs so an assistant can recommend it

- **A definition sentence at the top of every pillar and room**: "The Weekly Meal Planner is a Together City tool that builds a seven-day Indian meal plan from your preferences, allergies and blood test." Subject, class, mechanism, inputs.
- **Facts as lists, not prose**: inputs it reads · outputs it gives · what it refuses to do · price (if any) · who it is for. The "refuses" list is the trust signal competitors cannot copy.
- **Sourced claims with visible citations** — the pet desk already does this; the blood analysis does; make both visible in HTML, not behind a tap.
- **Consistent naming** across the site, schema, About page and any app-store listing: Together City (never "TogetherCity", never "Together AI" publicly), Mira, hub names as in `config/hubs.ts`.
- **A public "what Mira can do" page generated from the capability registry**, so the answer to "what can Together City's assistant do" is machine-current.
- **llms.txt** at the root: the definition, the hub list with one line each, the record-set index URLs, and the rules (no medical diagnosis, no invented prices). Cheap and increasingly read.
- **Third-party corroboration**: a Wikidata item, consistent Crunchbase/LinkedIn/Play Store descriptions, and the RERA/ vet-source citations pointing outward — assistants weight entities that other entities agree about.

### Question pages worth owning for AI search

"Can my dog eat \[Indian food\]?" (166 pages, sourced) · "What can I feed a family where everyone eats differently?" · "Which gemstone does my kundli call for?" · "What skincare routine fits ₹X a month?" · "Is there a dating app that only shows a few matches a day?" · "What is Together City / what can Mira do?" Each is a page whose first paragraph is the answer.

## IPriority roadmap

<table>
<colgroup>
<col style="width: 33%" />
<col style="width: 33%" />
<col style="width: 33%" />
</colgroup>
<thead>
<tr class="header">
<th>Phase</th>
<th>Work</th>
<th>Unblocks</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>P0 Foundation<br />
weeks 1–3</td>
<td>Prerender gate for public routes · per-route head manifest · canonical · 404 status · sitemap + robots update · Organization/WebSite schema · hub pillar copy for all 14 (definition sentence, room list as links, FAQ, the hub's line) · About page rewritten around "tell it once" · noindex hidden hubs, dating rooms, people pages · lang=en-IN</td>
<td>Everything else. Until this ships, no page below can be indexed</td>
</tr>
<tr class="even">
<td>P0 First record set<br />
weeks 3–5</td>
<td><code>/pets/eat/{species}/{food}</code> 166 pages from the static ingredient desk · /pets/eat index · Article + citation schema · /pets pillar links · 2 guides (Indian kitchen foods for dogs; foods never to feed cats)</td>
<td>The fastest path to real entrances: unique, sourced, Indian, low competition</td>
</tr>
<tr class="odd">
<td>P0 Commercial<br />
weeks 4–6</td>
<td>Gemstone pages with live per-carat pricing · Weekly Meal Planner and Beauty Routine press pages · SoftwareApplication schema</td>
<td>Revenue pages with existing tills</td>
</tr>
<tr class="even">
<td>P1 Scale the corpus<br />
weeks 6–10</td>
<td>Recipe pages (slugs, completeness gate, Recipe schema) · pet recipes · pet shop products with prices · /ask + /ask/{intent} from the registry · llms.txt · blood analysis press page (YMYL rules) · room press pages for the remaining ~50 rooms</td>
<td>Topical authority in nutrition and pets; Mira discoverability</td>
</tr>
<tr class="odd">
<td>P1 Runtime sets<br />
when volume exists</td>
<td>Edge SSR + runtime sitemap for services, properties, first-party jobs · LocalBusiness / RealEstateListing / JobPosting</td>
<td>Local search — only pays once citizens have listed</td>
</tr>
<tr class="even">
<td>P2 Editorial<br />
ongoing</td>
<td>/best/{audience} (≤12) · category comparisons · guides per hub (2–4 each) · Hindi press layer decision</td>
<td>Breadth</td>
</tr>
<tr class="odd">
<td>P3 Experimental</td>
<td>Public Mira "ask" box on /ask (WebSite SearchAction) · voice-search snippets · Travel hub when it returns</td>
<td>—</td>
</tr>
</tbody>
</table>

## JScorecard

Rubric: search value 0–20 · user intent 0–20 · product relevance 0–20 · differentiation 0–15 · business value 0–15 · internal-link value 0–10. Scores are judgements against the rubric, made from the product as it exists; "today" is the page as currently served.

| Page                             | SV  | UI  | PR  | Diff | BV  | IL  | Score  | Priority                        | Weakness today                                                   |
|----------------------------------|-----|-----|-----|------|-----|-----|--------|---------------------------------|------------------------------------------------------------------|
| / (home)                         | 14  | 15  | 20  | 13   | 15  | 10  | **87** | P0 | Empty shell; no definition sentence; doors are not links in HTML |
| /pets/eat/{species}/{food}       | 17  | 19  | 19  | 14   | 10  | 9   | **88** | P0 | Does not exist as a URL yet                                      |
| /nutrition/weekly                | 17  | 17  | 19  | 12   | 12  | 7   | **84** | P0 | Gated; no press render                                           |
| /pets (pillar)                   | 15  | 15  | 18  | 13   | 12  | 10  | **83** | P0 | One line and a poster                                            |
| /astrology/gemstones + /{gem}    | 16  | 16  | 17  | 11   | 14  | 6   | **80** | P0 | Gated; no stone pages                                            |
| /nutrition (pillar)              | 16  | 15  | 18  | 11   | 11  | 9   | **80** | P0 | One line and a poster                                            |
| /beauty/routine                  | 15  | 16  | 17  | 12   | 12  | 6   | **78** | P0 | Gated                                                            |
| /nutrition/recipes/{slug}        | 17  | 15  | 16  | 8    | 10  | 9   | **75** | P1 | Id URLs, gated, crowded SERP; wins only with the profile filters |
| /nutrition/journal               | 16  | 16  | 16  | 9    | 11  | 6   | **74** | P1 | Gated                                                            |
| /ask (Mira)                      | 10  | 15  | 20  | 14   | 12  | 8   | **79** | P1 | No public page; capability list lives only in the registry       |
| /medical/blood                   | 16  | 16  | 16  | 10   | 10  | 8   | **76** | P1 | YMYL; needs reviewer and citation surfacing                      |
| /family (pillar)                 | 11  | 15  | 17  | 13   | 9   | 8   | **73** | P1 | "Most under-sold hub"; the line exists, the page does not        |
| /fitness/body-goal               | 14  | 15  | 16  | 10   | 10  | 7   | **72** | P1 | Gated                                                            |
| /services/{id}                   | 15  | 16  | 14  | 8    | 11  | 7   | **71** | P1 | Empty until citizens list; needs runtime SSR                     |
| /dating (pillar)                 | 12  | 14  | 17  | 13   | 10  | 5   | **71** | P1 | Pillar only; every room noindex by design                        |
| /jobs (pillar)                   | 12  | 13  | 15  | 7    | 9   | 6   | **62** | P2    | Aggregated jobs cannot be indexed; thin first-party supply       |
| /ecommerce (pillar)              | 8   | 10  | 15  | 10   | 10  | 8   | **61** | P2    | A door, not a shop; rank the hub shops instead                   |
| /entertainment (pillar)          | 10  | 10  | 12  | 3    | 5   | 5   | **45** | P3    | Third-party data; keep a pillar, do not invest                   |
| /mail, /financial, /social rooms | 4   | 6   | 10  | 4    | 4   | 2   | **30** | noindex                         | Private by definition                                            |

## KAutomation and quality control

### When a new app is added

Every input the brief asks the system to derive already has a source of truth in the repo. The generator reads them; a human approves the output.

| Output                             | Derived from                                                                                                                         | Confidence rule                                                            |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| URL, hub, category                 | `config/hubs.ts` item path + `PETS_SIDEBAR`-style feature routes                                                                     | Deterministic                                                              |
| Indexability, canonical            | `RequireAuth` wrapping in `router.tsx` + a `press:` flag on the route (does it have a signed-out render?) + robots list              | No press render → noindex, no review needed                                |
| Title, description, H1             | Item `label` + `sub` + hub line, through the copy rules (never "personalised", no banned words) — then a human writes the final line | Always reviewed: copy is the brand                                         |
| Keyword cluster, intent            | Hub cluster table (C) + item label; classified into the nine intents                                                                 | Reviewed if the hub is Medical or Dating (high-risk)                       |
| Schema                             | Route type → schema map (G5); fields from the record                                                                                 | Validated by test; fails the build on mismatch                             |
| Internal links, related apps       | Same hub siblings + the cross-hub mechanism map (B) + records that reference the app                                                 | Deterministic                                                              |
| FAQ candidates                     | Questions from the hub's audit docs and support copy (`failure-states`, `citizen-facing-copy`) — never invented                      | Reviewed                                                                   |
| Comparison / content opportunities | Flagged only when ≥3 sibling apps exist (best-for) or a category has a clear "instead of N apps" story                               | Reviewed                                                                   |
| Score                              | Rubric J, with SV and BV defaults per hub from this document                                                                         | \<70 → not generated; 70–79 → reviewed; ≥80 with Medical/Dating → reviewed |

### Pre-publication audit (runs as a gate, not a checklist in a doc)

- Intent satisfied by the signed-out render alone · unique title/description/H1 · one H1, logical H2s · canonical self or owner · schema validates against visible content · no personal data in press HTML · every claim traceable to a record or a doc · no banned words (seamless, holistic, empower, journey, ecosystem, AI-powered, personalised) · no price, rating, review or statistic that the database does not hold · ≥3 internal links in, ≥3 out · breadcrumb · CTA into the room · mobile layout holds at 360px · the product supports the promise (a room that is "Not yet —" in its own subtitle, like Order Blood Tests and Talk to a Doctor, is noindex).

### What to measure once live

Search Console coverage (indexed vs. discovered, soft-404 count should be zero) · impressions per record set · the query report for "can my dog eat" and Hindi-transliterated foods · sign-ins that begin on a press page (add `?from=press` only on the CTA, never on a canonical URL) · Mira sessions that begin from /ask/{intent}. Search Console and Keyword Planner numbers replace every demand tier in section C as they arrive.

Sources read for this page: `src/app/router.tsx`, `src/config/hubs.ts`, `src/features/pets/routes.ts` and `data/*`, `index.html`, `public/robots.txt`, `vercel.json`, `prisma/schema.prisma` (132 models), project docs Mira.md, Hub-Copy-Deck.md, How-Deployment-Works.md; live fetch of togethercity.app and /sitemap.xml. Nothing in this document states a search volume, ranking or competitor position as a measured fact.


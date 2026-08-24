# The City Says It Once — Copy Audit, 24 Aug 2026

**Method.** Seven parallel copy reviews across every user-facing surface — chrome & landing,
Pets, the health cluster, commerce, comms & Mira, dating & astrology & social, lifestyle —
each read as an advertising professional would: does this line sell, inform, or merely talk?
Every quoted "before" was then re-grepped against the source (25/25 spot-checks verbatim).
**Nothing has been edited.** This is the approval pass; say the word and the cuts land.

**Verdict.** The city can lose **roughly 4,500–5,300 words of on-screen copy — about 40% of
its explanatory text — with zero loss of meaning, trust, or honesty.** The writing is good;
there is simply twice as much of it as any surface needs. The strongest lines in the app are
already ad-grade ("Done — we're good for 30 days. Now, where were we?"). The problem is the
sentences stacked around them.

---

## The six house habits (what's actually inflating the copy)

1. **The em-dash double clause.** Nearly every string is "claim — restatement of claim."
   Cutting the second clause is the single highest-yield edit in the codebase. (~60 instances)
2. **The app narrates its own design ethics.** "We would rather ask than guess", "a bag that
   quietly empties itself is a bag that lies", "we would rather say that than show you an
   empty shelf." The honest *behaviour* is right and stays; the speech about being honest
   goes. An ad professional shows the proof, never the virtue. (~25 instances, ~350 words)
3. **Triple reassurance in error states.** "Nothing has been lost + everything is still
   there + we just couldn't read it + try again." One reassurance clause and a next step.
   (~30 instances, ~400 words)
4. **Body copy restating the heading, the button, or the control beside it.** (~45 instances)
5. **The same rule re-taught on every surface.** The dating chat cap is stated 5×; the
   mutual-like rule 4×; "customer number, not your name" 6×; Post & Earn honesty 2× in full;
   grocery "duplicates merged" 2× per page. Once per journey, one clause elsewhere.
6. **Engineering vocabulary on citizen screens.** "source of truth" ×5, "by reference",
   "data boundary", "regenerated from its seed", "one neutral chassis", "relying on the
   conversation being matched." (~20 instances)

## Five things the audit caught that are wrong, not just long

| Where | Problem |
|---|---|
| `features/dating/pages/DatingProfile.tsx:681` | "only matches scoring 75%+ are ever shown" is **false** — Potential Matches deliberately shows every band down to "Little in common" |
| `features/dating/pages/DatingMatchDetail.tsx:248` | "opens an anonymous chat" **contradicts** the chat screen's "You appear as yourself" |
| `features/pets/pages/Today.tsx:39` | "Seven short questions and the week is built" — the seven-question wizard was **removed**; the plan builds from the profile |
| `features/travel/pages/Bookings.tsx:76` | "View and manage all your travel bookings" — the page itself explains it **can't** manage bookings |
| `features/astrology/pages/AstroAsk.tsx:211` | "personalized" (US) against the house "personalised" (UK) — one spelling per city |

## What was deliberately left alone

Every safety caveat, dosage line, "DATA NOT VERIFIED" marker, source URL, evidence band,
consent promise, money reassurance ("nothing is charged until you pay") and dating honesty
rule survives — many in fewer words, none deleted. Mira's one-liners were judged the best
copy in the app and are untouched. `dev/`, `admin/` and `moderation/` were skipped as
non-citizen surfaces.

## Strings pinned by tests

These exact phrases are asserted by the suite. Every proposed rewrite below either keeps the
pinned fragment or is flagged; only one cut (tarot masthead) needs a deliberate test edit.

- `mira-has-a-door-on-a-phone.test.ts` — the two "Talk to Mira…" labels must stay identical (regex anchors only "Talk to Mira", so the short label passes)
- `mira-is-one-room-and-a-door.test.ts` — "which version of me you need"
- `mira-reads-one-chat.test.ts` — "keep(s) none of it" (survives at line 158)
- `mira-tolerates-an-older-server.test.ts` — "not speaking the same language"
- `the-counter-prices-what-it-sells.test.ts` — "Nothing here is a recommendation"
- `a-note-not-a-paragraph.test.ts` — "Nobody is hidden for scoring low" + "Like someone and they hear nothing; like each other and you both do"
- `the-masthead-claims-what-it-does.test.ts` — Ask Astra masthead fragments
- `nothing-is-dealt-until-you-turn.test.ts` — pins BOTH tarot masthead sentences; cutting "regenerated from its seed" needs its assertion removed on purpose
- `budget-is-on-the-page.test.ts` — "won't go over your budget without asking"
- `one-bag.test.ts` — "city wallet" somewhere in beauty `Orders.tsx` (the pay button keeps it)
- `own-day.test.ts` — "Lock it and the next dish you add starts the day after"
- `planner-rail.test.ts` — the "pantry item" fragment
- `peer.test.ts` — "relay server" · `the-day-is-kept.test.ts` — "half-written"

---

# The cuts, area by area

Format: **Now** → **Proposed**. ✂ = delete outright. 🔒 = test-pinned, handled as noted.

## 1 · Chrome, landing, auth, legal & privacy — est. 550–650 words (850+ with the two bonuses)

| Where | Now | Proposed |
|---|---|---|
| `pages/Home.tsx:220` hero eyebrow | "Welcome to Together City" | ✂ (the wordmark is 40px above it) |
| `pages/Home.tsx:223` hero lede | "Set your preferences once, and every service in Together City is personalized just for you. No more random browsing." | "Set your preferences once. Every hub personalizes to you." |
| `pages/Home.tsx:247` gold CTA 🔒 | "Talk to Mira — your personal assistant" | "Talk to Mira" (change both twin labels together) |
| `pages/Home.tsx:36–49` PAVILIONS data | eleven `blurb`/`meta` marketing strings | ✂ — **~130 words rendered nowhere**; the fallback grid shows only titles |
| `pages/Dashboard.tsx:79` load error | "Your profile didn't come back from the server, and everything on this page is built out of it — so rather than draw you a city we'd be guessing at, we've stopped here. Nothing has been lost or changed. This is ours, not yours." | "Your profile didn't load, and this page is built from it. Nothing has been lost — this is on us. Try again." |
| `pages/Dashboard.tsx:110` greeting sub | "Everything here is yours — what you've told us, what you've planned, what's waiting. Nothing on this page is a sample." | "Nothing on this page is a sample." |
| `pages/Dashboard.tsx:130` completion card | "Each hub reads from this one profile, so anything you add here saves you answering it somewhere else." | "One profile, every hub — add it once, never again." (same fix on the complete branch) |
| `pages/Dashboard.tsx:233` empty state | "That's not a mistake — there's nothing here yet because you haven't put anything here yet. Start anywhere; the rest of the city will read from it." | "Nothing here yet. Start anywhere — the city reads from it." |
| `pages/Dashboard.tsx:204` partial load | "Some of these didn't load just now, so this list may be short. Alerts and Dating will have the real answer." | "Some counts didn't load — Alerts and Dating have the full picture." |
| `pages/Dashboard.tsx:186` blood footnote | "The values are on your medical page, where the ranges and what they mean are with them." | ✂ ("Read it →" already says it) |
| `components/form-validation.tsx:70` every form | "Please complete the following before saving:" | "Complete these to save:" |
| `components/form-validation.tsx:40` every field | "Please complete ${r.label}." | "${r.label} is required." |
| `config/hubs.ts:105` Services tag | "The people who fix, teach and take care of things near you" | "Fix it, learn it, book it — near you" |
| `config/hubs.ts:276` cart sub | "Every shop in the city, one list" | "One list, one checkout" (hub tag two lines up already says "Every shop…") |
| `config/hubs.ts:160` nav label | "Connect with Blood Test" | "Connect Blood Test" |
| `config/hubs.ts:393` Sent folder sub | "Messages that were accepted" | "What went out" |
| `features/auth/pages/RegisterForm.tsx:133` | "One city for your whole life. Create your account in seconds." | "One city for your whole life." |
| `RegisterForm.tsx:214` ToS note | "Your data is yours. Sensitive information — health, dating, finances — stays private by default and is only used to personalize the features you choose." | "Your data is yours. Health, dating and money stay private by default." |
| `RegisterForm.tsx:87` error | "Please accept the Terms of Service and Privacy Policy to continue." | "Accept the Terms and Privacy Policy to continue." |
| `RegisterForm.tsx:107` welcome | "so we can reach you if you lose your password." | "so you can recover your account." |
| `features/auth/pages/SignIn.tsx:232` | "You'll stay signed in on this device until you sign out." | ✂ |
| `SignIn.tsx:66` code notice | "If an account matches, we've sent a 6-digit code to the phone on it — or to its email if there is no phone. Enter the code below." | "If an account matches, a 6-digit code is on its way — to its phone, or its email if there's no phone." |
| `features/auth/VerifyEmailBanner.tsx:62` | "Nothing is locked until you do." | ✂ |
| `features/auth/components/VerifyChannel.tsx:11` | "Use the address you actually read — Gmail, Yahoo, or your work address. Your @togethercity.app inbox does not need verifying." | "An address you actually read — not your @togethercity.app inbox." |
| `VerifyChannel.tsx:18` | "Include the country code. We only use this to secure your account." | "Include the country code." |
| `VerifyChannel.tsx:157` send failure | "Nothing is wrong with your address or your account — the send itself is failing," | "It's on our side — your address and account are fine. Try again later." |
| `components/InstallCity.tsx:139` button | "Download App for Android" | "Download for Android" |
| `InstallCity.tsx:162` | "You downloaded this before — take it again only if you need the latest version." | "Already downloaded — tap for the latest version." |
| `features/privacy/HubConsentGate.tsx:78` button | "Got it — continue" | "Continue" |
| `features/privacy/consent.config.ts:37` | "Your dating profile is never visible to connected family or friends, and only appears to compatible matches you choose to interact with." | "Family and friends never see this — only compatible matches you choose do." |
| `features/privacy/pages/PrivacySettings.tsx:44` | "You choose what Together City can use, feature by feature." + hedge | "Feature-by-feature control. Turn anything off — it takes effect immediately." |
| `PrivacySettings.tsx:61` | "Each of these shows a short privacy explainer the first time you enter. Here's the promise for each and whether you've reviewed it." | "Each hub's promise, and whether you've reviewed it." |
| `features/legal/LegalCenter.tsx:92` lede | "Every term, disclaimer, and agreement that governs Together City — a single platform spanning social, dating, AI, medical, nutrition, restaurants, travel, commerce, payments, and the creator economy. Organised into five volumes. Each document is linked below." | "Every term, disclaimer and agreement that governs Together City, in five volumes." |
| `LegalCenter.tsx:68` draft banner | "These documents are written to a publishable standard but are templates." (+2nd sentence) | "Drafts pending review by Indian counsel; items marked like this are placeholders." |
| `pages/Info.tsx:11` privacy lede | "Plain-language summary of what Together City collects, why, and the control you keep. This is a product summary, not a substitute for legal counsel." | "What we collect, why, and the control you keep — in plain language." |
| `pages/Info.tsx:80` contact | "We'd love to hear from you." | ✂ |
| `pages/NotFound.tsx:6` 404 | "That corner of the city doesn't exist yet — everything you saved is exactly where you left it." | "That corner of the city doesn't exist yet." |

**Bonus cut available:** `Info.tsx`'s privacy/terms pages restate the Legal Center at a third
length — link instead of restate (~250 more words).

## 2 · Pets — est. 420–480 words

| Where | Now | Proposed |
|---|---|---|
| `pets/pages/Today.tsx:39` ⚠ stale | "Seven short questions and the week is built." | "The plan builds itself from the profile." |
| `pets/pages/ProductPage.tsx:80` every product | "Held for catalogue research — merchant authorisation is needed before it is republished commercially." | ✂ (internal licensing note; the retailer credit line stays) |
| `pets/pages/Cart.tsx:99` | "They are still in the bag — we would rather show you an incomplete total than a confident wrong one." | "They stay in the bag." |
| `pets/pages/Cart.tsx:104` button | "Checkout — connects to Together City Pay" | "Checkout" |
| `pets/pages/Cart.tsx:107` | "Checkout is not wired in this build. Payments belong to the city's existing Pay service rather than to a second implementation inside this hub." | "Checkout arrives with Together City Pay." |
| `pets/pages/ProductPage.tsx:125` vet box | "This is a prescription-channel or health-claim product. Together City does not diagnose, and no product page here claims a product treats or prevents disease. Your vet decides whether this is right for your pet." | "Prescription-channel product. Your vet decides whether it's right for your pet." (page-foot disclaimer already carries the middle) |
| `pets/pages/ProductPage.tsx:175` | "The source listing does not publish a guaranteed analysis for this product, and we will not reproduce one from memory or from a similar SKU. The pack itself carries the analysis and the feeding chart — that is the number to feed against until the merchant supplies data directly." | "The source listing doesn't publish a guaranteed analysis, and we won't invent one. Feed to the analysis and chart on the pack itself." |
| `pets/pages/Specialist.tsx:108` empty | "The catalogue is 184 real products deep and this need is not covered by any of them for this species. Rather than showing you something adjacent, we are saying so." | "None of our 184 products covers this need for this species yet." |
| `pets/pages/Compare.tsx:130` | "No "best ingredient profile" verdict is shown: fewer than two of these products publish a guaranteed analysis on their source listing, and comparing a published protein figure against an absent one would be a ranking of paperwork rather than of food." | "No ingredient verdict — fewer than two of these publish a guaranteed analysis." |
| `pets/pages/Wellness.tsx:122` | "Together City stores this and does not interpret it — nothing here changes a recommendation, and no product on this site treats a condition." | "Stored, never interpreted." (after "What a vet would ask for, kept where you can read it out.") |
| `pets/pages/PetsHome.tsx:110` | "Add a profile and the whole district reshapes around them — the planner, the shelf, the shopping list and the reminders." | "Add a profile and the whole district reshapes around them." |
| `pets/pages/PetsHome.tsx:177` | "Profile, nutrition, home cooking, shopping, wellness, activity and services are one chain here, not eight tabs." | ✂ (next sentence makes the point better) |
| `pets/pages/PetsHome.tsx:104` | "Switch between pets — every plan, list and recommendation follows the one you choose." | "Switch pets — the whole district follows the one you choose." |
| `pets/pages/PetsHome.tsx:142` | "Six rooms, one animal at the centre of all of them." | "Six rooms, one animal at the centre." |
| `pets/pages/Profiles.tsx:200` photos note | "Up to five. The first is the one the city shows on every card. Location data is removed on your device before anything leaves it, and each photo is saved to your account as you add it." | "Up to five — the first is the one every card shows. Location data is stripped on your device." (both branches) |
| `pets/pages/Profiles.tsx:299` | "A name and a weight are needed before a plan can be calculated." | ✂ (header + disabled button already say it) |
| `pets/pages/Profiles.tsx:135` | "Everything downstream — calories, meals, the shelf, the reminders — is computed from these." | "Everything downstream is computed from these." |
| `pets/pages/DietPlanner.tsx:79` loading | "Building ${pet.name}'s month from the energy equations, the catalogue and the composition tables…" | "Building ${pet.name}'s month…" |
| `DietPlanner.tsx:89` | "Calculated from the profile — no second form to fill in." | "Calculated from the profile." |
| `DietPlanner.tsx:73` empty | "Weight and age are the two figures the energy equation runs on. Add them to the profile and the plan builds itself." | "Add a weight to the profile and the plan builds itself." |
| `DietPlanner.tsx:181` | "The grocery list under the month covers every pet in the house — {names} — as one order." | "One grocery list covers the whole house — {names}." |
| `pets/pages/Monthly.tsx:191/192` | "…added up and merged into one order. Two halves, because they are bought in two different places." | "…merged into one order." / "Every meal above, added up." (list titles explain the split) |
| `Monthly.tsx:200` button | "Add the whole order to cart" | "Add all to cart" (and the "Add everything" twin) |
| `Monthly.tsx:232/233` | "From your own kitchen shop — one quantity per ingredient, for every pet's home-cooked meals this month." | "One quantity per ingredient, for the month's home-cooked meals." |
| `pets/pages/Market.tsx:80` | "Every price, pack size and source on this shelf was read off the retailer's own page." | "Every price read off the retailer's own page." |
| `pets/pages/Specialist.tsx:73` | "Shop by what your pet needs rather than by what a shelf is called. Every need here carries the line where shopping stops and veterinary care starts." | "Shop by need, not by shelf name. Every need shows where shopping stops and the vet starts." |
| `pets/pages/Quiz.tsx:54` | "Activity comes from what you logged today ({logged} minutes). Nutrition, environment and preventive care are read from {pet.name}'s profile." | ✂ (subtitle already says it) |
| `Quiz.tsx:74` | "Eight dimensions, scored from your profile and today's logs. This is a prompt sheet, not an assessment of your pet's health — the only person who can do that has met them." | "Scored from your profile and today's logs. A prompt sheet, not a diagnosis — that's your vet's job." |
| `Quiz.tsx:48` | "Three questions the profile can't answer for ${pet.name}. Everything else comes from what you've already told us." | "Three questions the profile can't answer. The rest we already know." |
| `pets/pages/Today.tsx:89` treats | "Ten per cent of the day, which is where UC Davis and WSAVA both put the ceiling. Treats come out of the meal budget, not on top of it — the meals above already account for this." | "10% of the day — the UC Davis and WSAVA ceiling, already counted in the meals above." |
| `pets/data/density.ts:78` caveat | "Estimated: this listing doesn't publish calories per kilogram, so the range assumes a published density band. Your pack's own feeding guide is the number that counts — real foods vary, and an individual animal's requirement can sit 50% either side of any formula (WSAVA)." | "Estimated — this listing doesn't publish kcal/kg. Feed to your pack's own guide; individual needs can vary 50% either side of any formula (WSAVA)." |
| `pets/components/PetPhotos.tsx:266` | "Photos of a pet at home carry the coordinates of that home, and Together City takes them out on the device." | ✂ (preceding sentence already delivers it) |
| `pets/components/MealCard.tsx:87` | "Weigh to your pack's feeding guide for {kcal} kcal; it is the figure that counts." | "Weigh to your pack's feeding guide for {kcal} kcal." |
| `pets/pages/Compare.tsx:83` | "Only rows the source data actually supports. A blank here is a gap in the retailer's listing, not a gap in the product." | "A blank is a gap in the retailer's listing, not in the product." |
| `pets/pages/Bundles.tsx:66` | "Curated kits, priced from real listings. A kit's total counts only the items whose price we could verify." | "Curated kits, priced from real listings. Totals count verified prices only." |

## 3 · Nutrition, medical, medicines & family — est. 800–950 words

| Where | Now | Proposed |
|---|---|---|
| `nutrition/pages/RecipeLibrary.tsx:281` intro | "Add the dishes you want and they build the day below. Lock a day and its ingredients go straight to your grocery list — then the next dish you add starts the day after, which is how you fill a month. Say how many people you are cooking for and every quantity on that list scales. Browse a cuisine for ideas, or add a dish you cook yourself under…" | "Add dishes to build your day. Lock it — the ingredients go straight to your grocery list." |
| `nutrition/pages/Preferences.tsx:747` footer | "Personalised for you · Expert guidance · Quality you can trust · Better every day" | ✂ (slogan wall) |
| `Preferences.tsx:711` | "Health conditions moved to their own section above." | ✂ (migration changelog shown forever) |
| `Preferences.tsx:292` load error | "…Everything you saved is untouched — and we won't show a blank form over it, because saving that would overwrite preferences that still exist. Try again in a moment." | "We couldn't load your profile just now. Everything you saved is untouched — try again in a moment." |
| `Preferences.tsx:490` cuisine mix | "Set how much of each kitchen your plans should lean on. Drag a slider up to give it a bigger share of your weekly meals." | "Give each kitchen its share of your week." |
| `nutrition/pages/RecipeDetail.tsx:434` panel | "Make it even better" + three bullets of UI tutorial | ✂ (controls are self-evident) |
| `nutrition/pages/MealPlan.tsx:621` | "Personalized for your goals, preferences & health." | ✂ |
| `MealPlan.tsx:582` refusal body | "A meal plan is portions, and portions come from a body. We'd rather ask than guess — a week of meals measured for somebody else isn't a plan, it's a plan for somebody else." | "Portions come from your body's numbers — add them below and the plan builds itself." |
| `MealPlan.tsx:25` profile gate | "Your weekly plan is built from your Food Preference Profile — diet, cuisines, foods you avoid, allergies and protein sources — then refined by your health profile and blood reports. Save it once and every future plan uses it." | "Save it once — every plan is built from it." |
| `MealPlan.tsx:824` | "Tap any meal to view the full recipe — ingredients & step-by-step instructions." | "Tap any meal for the full recipe." |
| `MealPlan.tsx:190` 🔒 | "pantry items (salt, oil and the like) left off — you almost certainly have them." | "pantry items (salt, oil and the like) left off." (pinned fragment intact) |
| `nutrition/pages/SavedRecipes.tsx:100` | "Open any recipe and press Save — it lands here, and it is the same list the recipe page reads to decide whether its bookmark is filled in." | "Open any recipe and press Save — it lands here." |
| `nutrition/components/OwnDayView.tsx:563` | "A day that was never locked is not on your grocery list and never will be — locking is what puts a day's ingredients there. It is still yours: open a dish to cook it, or add it again to the day you are building now." | "Unlocked days never reach your grocery list — lock a day to shop it." |
| `OwnDayView.tsx:334` | "Every ingredient quantity on your grocery list multiplies by this. The calories and macros above stay one person's — they are what you are eating, not what the kitchen is producing." | "Grocery quantities multiply by this; the figures above stay one person's." |
| `OwnDayView.tsx:417` 🔒 | "Lock it and the next dish you add starts the day after — that is how the month fills." | "Lock it and the next dish you add starts the day after." (pinned half kept) |
| `OwnDayView.tsx:466` error | "Nothing has been lost — anything you added is still there. This is only the reading of it." | "Anything you added is still there — try again." |
| `nutrition/components/OwnRecipes.tsx:123` | "List what goes in it and how much, and we'll work out the calories and macros the same way we do for every recipe in the library — from the ingredients, not from a number anybody typed." | "List what goes in it — we work out the calories and macros from the ingredients." |
| `nutrition/components/CookMode.tsx:179` | "Tell us where you got to and we'll pick the method back up from the next step — with its timer." | ✂ (heading already asks it) |
| `nutrition/components/GroceryPlanner.tsx:297` | "Every item below comes from the menus you locked, in the plan you locked them in — real quantities, duplicates merged, nothing inferred." | "Everything below comes from the menus you locked — nothing inferred." |
| `nutrition/pages/Grocery.tsx:28` | "Built from your saved meal plan and organised like a supermarket — real quantities, duplicates merged, tap to check items off as you shop." | "Built from your meal plan, organised like a supermarket." |
| `nutrition/components/ShoppingRange.tsx:138` | "Only ingredients from locked menus appear below — a menu you have not locked can still change, and buying for it would buy food you may never cook." | "Only ingredients from locked menus appear below." |
| `ShoppingRange.tsx:161` | "Open the meal plan, read the menu for each of these days, and lock the ones you are happy with." | ✂ (the lock buttons below are the instruction) |
| `nutrition/pages/Blood.tsx:51` | "All medical records live in your Medical Hub — the single source of truth. Nutrition reads your biomarkers by reference (never a copy), only while this connection is on." | "Your records stay in the Medical Hub. Nutrition reads them only while this is on — never a copy." |
| `Blood.tsx:62` | "We couldn't check whether this connection is on, so we're not showing you a switch — one that guessed would be worse than none. Nothing has changed either way." | "We couldn't check whether this connection is on. Nothing has changed either way." |
| `nutrition/pages/Checkout.tsx:84` | "Nothing has been added yet. Your grocery list is built from the meals in your plan — open it and add what you need." | "Your grocery list is built from the meals in your plan — open it and add what you need." |
| `nutrition/components/AddToPlan.tsx:88` | "Your plan ran to {date} and every day in it has passed, so there is no day left to put this in. Build the next block and it can go straight into one." | "Your plan has ended — start the next one and this dish can go straight in." |
| `medical/pages/BloodAnalysis.tsx:415` | "Upload a photo or PDF of your blood report. We read the values and analyse it automatically — no extra steps. The same report also appears in your…" | "The report is filed in your Health Records too. Numbers only, never diagnoses — edit any reading below." |
| `BloodAnalysis.tsx:436` | "Each field shows its reference range and flags out-of-range values. Decimals are kept exactly as entered." | ✂ (narrates visible UI) |
| `medical/pages/Records.tsx:222` | "One secure place for conditions, prescriptions, reports, allergies and vaccinations — your source of truth, shared with other hubs only with your consent." | "One secure place for every record — shared only with your consent." |
| `Records.tsx:137` error | "Your vault is untouched — nothing has been deleted or changed. We simply couldn't read it just now, and we would rather say that than show you an empty shelf." | "Your vault is untouched — we just couldn't read it. Try again." |
| `Records.tsx:346` error | "We couldn't load your latest panel just now — which is not the same as there not being one. Nothing has been lost; it's worth another try in a moment." | "We couldn't load your latest panel — nothing has been lost. Try again in a moment." |
| `medical/pages/Timeline.tsx:104` | "◈ Your Longitudinal History ◈ Auto-Plotted from Records ◈ Private to You ◈ Shareable, Consent-Scoped" | "◈ Private to You ◈ Consent-Scoped" |
| `medical/pages/Connections.tsx:49` | 84-word "Who has looked" essay | "Together City doesn't yet record which hub read what, and we won't invent a log. When a true read-by-read record exists, it will live here." |
| `medical/pages/Consent.tsx:47` | "🔒 Consent is enforced server-side: a hub without permission is refused at the data boundary, not just hidden in the interface. You can change this any time." | "🔒 Enforced server-side — a hub without permission is refused, not just hidden." |
| `medical/pages/Family.tsx:133` | "A high-level view of every household member's health. Detailed records stay private in each person's own Medical Hub — this page only shows summaries they've chosen to share." | "Records stay private in each person's own Medical Hub — this page shows only what they've chosen to share." (+ cut the footer repeat at :164) |
| `family/pages/Grocery.tsx:23` byline | "Built from your family meal plan · portioned for N people · organised like a supermarket" | ✂ (restates the sub one line up) |
| `family/pages/Grocery.tsx:48` footer | "◈ Portioned for your family ◈ No duplicates, no waste ◈ Supermarket-organised ◈ Ordering coming soon" | ✂ (third repetition on one page) |
| `family/pages/Connect.tsx:451` footer | 43-word repeat of header + privacy card | ✂ |
| `Connect.tsx:183` | "This is a family-level setting — it applies to everyone in the household." | ✂ (card is titled Family Meal Planning) |
| `family/pages/Weekly.tsx:150` | "One kitchen for ${people} — every dish below is cooked once and plated to each member's own target, with everyone's allergies, exclusions and conditions already applied to the shared dishes." | "One kitchen for ${people} — everyone's allergies and conditions already applied." |
| `family/components/FamilyPortions.tsx:77` | 34-word footer restating the table above it | ✂ |
| `family/pages/Search.tsx:121` | "Tell us what's in the kitchen — we search the Together City world database and respect every member's diet, flag kid-friendly recipes, and portion ingredients for the whole family." | "Tell us what's in the kitchen — we find dishes that fit every member, portioned for the family." |
| `Search.tsx:190` | "Cooking for {N} — vegetarian members are honoured, so non-veg dishes are auto-excluded while "Family-safe" is on. Lighter meals are flagged…" | "Cooking for {N}. Lighter meals are flagged…" (switch label sits directly above) |
| `family/pages/Pantry.tsx:103` footer | "The pantry is owned by the household, not any one person. It updates when groceries are ordered and as meals are cooked, so the grocery planner can skip what you already have." | ✂ (header sub says it all) |

## 4 · E-commerce, services, jobs, real estate, pay — est. 750–850 words

| Where | Now | Proposed |
|---|---|---|
| `services/pages/Browse.tsx:109` hero | "Genuine businesses and people around you. Compare them, message them without giving your name, and decide with something behind the badge." | "Genuine businesses near you. Message them without giving your name." |
| `Browse.tsx:191` trust card | 45-word "Together Verified" paragraph | "Each badge names one thing we checked — identity, registration, address. Nobody buys one. Messaging stays inside Together City." |
| `Browse.tsx:223` owner card | "Get discovered by people nearby. Listing is free, and verification is what makes people write to you." | "Free to list. Verification is what makes people write to you." |
| `Browse.tsx:204` empty | "This directory fills up from the people who live here. If you run something — a trade, a class, a kitchen — you can be the first." | "Run something — a trade, a class, a kitchen? Be the first to list it." |
| `ecommerce/pages/PersonalizedStore.tsx:56` | 74-word architecture footnote | "Every product belongs to the hub that verified it — each card opens that shop. The grocery list has no price, so its card hands you the list." |
| `PersonalizedStore.tsx:42` | "Made for you, out of what you have already told the city. Each shelf here reads one profile and answers with a shortlist instead of a catalogue." | "Each shelf reads one profile and answers with a shortlist, not a catalogue." |
| `ecommerce/pages/OpenMarket.tsx:57` | 50-word policy essay | "No resellers — every aisle belongs to the hub that verified what is on it." |
| `OpenMarket.tsx:44` | "Everything the city sells, by category — the whole shelf, in the room that stands behind it." | "Everything the city sells, by category." |
| `ecommerce/pages/CityCart.tsx:45` | "Everything you have added, from every shop in the city. Each shop keeps its own bag — this is all of them in one place, with one total." | "Every shop's bag, one total." |
| `CityCart.tsx:137` | "Each shop confirms separately, so you will see a line for each. Nothing is charged until you press Pay." | "Each shop confirms separately. Nothing is charged until you press Pay." |
| `ecommerce/store/useGemCounterShop.ts:193` 🔒 | "Sold loose and unset — a mounting is four more decisions and the studio in the Astrology Zone asks them one at a time, judging each against the stone. Nothing here is a recommendation: …" | "Sold loose and unset — the Astrology Zone studio handles mounting. Nothing here is a recommendation: the stones your own chart calls for are in the Personalized Store." |
| `ecommerce/store/StoreBagPage.tsx:59` | "Nothing is charged until you pay, and it stays here until you take it out. This is the same bag as the one in {shop} — one bag, wherever you filled it." | "Nothing is charged until you pay. Same bag as in {shop} — wherever you filled it." |
| `ecommerce/store/useFitnessShop.ts:103` (+ twin `useMarketShops.ts:201`) | "Prescription items are not sold here — they are on the Fitness shelf, beside the reasoning and the limits that belong with them." | "Prescription items live on the Fitness shelf." |
| `useFitnessShop.ts:93` | "The shelf is the general one until your training profile and health data have been read, and a general list shown as yours is worse than no list." | "Fill in your training profile and this shelf is matched to you." |
| `useMarketShops.ts:278` | "This aisle is for looking. The pet basket lives in Pet Care, where the ingredient checks and the species filters are — every tile here opens the product there." | "This aisle is for looking — every tile opens the product in Pet Care, where the basket lives." |
| `realestate/pages/Explore.tsx:113` | "Real listings from real owners, photo-verified and moderated before they go live. Every one below is somebody's actual address, priced by the person who owns it." | "Real listings from real owners — photo-verified before they go live, priced by the person who owns it." |
| `realestate/pages/Sell.tsx:236` | "Capture live photos, add accurate details, and list as many properties as you like. Everything you post is checked before it appears in Explore, and you can see exactly why in My Listings." | "List as many properties as you like. Everything is checked before it appears in Explore." |
| `Sell.tsx:257` | "Authentic photos only. Pictures should be taken live through your camera so every buyer can trust the listing." | "Authentic photos only — taken live through your camera." |
| `Sell.tsx:307` | "Add it to your submission list, then capture the next one." | ✂ (button says it) |
| `realestate/pages/MyListings.tsx:94` | 40-word process standfirst | "Every listing, with where it stands and why. Edit a rejected one and it goes back through review." |
| `realestate/pages/UnderConstruction.tsx:71` | "Pre-launch and in-progress projects, each with its RERA registration, a live build-progress tracker, floor plans, and the payment and construction milestones you are agreeing to." | "Pre-launch and in-progress projects — RERA registration, build progress, floor plans, milestones." |
| `services/pages/Messages.tsx:75` | "These conversations live here only — they are not in your Chats. A business sees a customer number, not your name, until you decide to show it." | "Separate from your Chats. A business sees a customer number, not your name, until you show it." |
| `services/pages/Regulars.tsx:37` | "The businesses you keep. Nobody is told they have been saved — this list is yours and only yours." | "The businesses you keep. Only you see this list." |
| `Regulars.tsx:45` empty | "When you find someone worth keeping — the electrician who turns up, the tiffin you actually like — press Keep on their card and they land here." | "Press Keep on the electrician who turns up, the tiffin you actually like — they land here." |
| `services/pages/DailyOffers.tsx:35` | "Every one of these has an end date and goes away on its own, so nothing here is stale." | ✂ (date chips show it) |
| `DailyOffers.tsx:42` empty | "Businesses post their own offers, and they run for the days they choose. If you list a business, this is where yours would appear." | "Businesses post their own offers, for the days they choose." |
| `services/pages/EditBusiness.tsx:51` | "Everything here can change — the name, what you do, where you are, your photos. Your messages and the people who kept you stay exactly as they are." | "Change anything — your messages and regulars stay put." |
| `EditBusiness.tsx:31` error | "The form starts from what you already wrote, so it waits rather than showing you a blank page. Try again in a moment." | "Nothing you wrote is lost — try again in a moment." |
| `services/ListingForm.tsx:304` | "Leave it blank and we will make one from your business name. You can change it later — but anyone who has your old address will stop finding you, so change it early." | "Blank? We make one from your name. Changing it later breaks old links." |
| `ListingForm.tsx:256` | "A business has to pick one, so the form waits for them. Try again in a moment." | "Try again in a moment." |
| `ListingForm.tsx:571` | "Leave it off and people reach you only through the message room, where they stay anonymous and so does your number." | "Off, people reach you only through messages — your number stays private." |
| `services/Verification.tsx:197` | "They are not lost — you will get them over the coming days, or all at once the moment this listing is verified." | "They are not lost — verify and they arrive all at once." |
| `services/MenuEditor.tsx:132` | "Photograph your menu and it will be typed out for you. You check every line before anything is published — nothing is saved until you say so." | "Photograph your menu and it's typed out for you. Nothing publishes until you approve every line." |
| `services/HoursEditor.tsx:184` | "Set once. Your page and your card work out "open now" from these — there is no switch to flip each morning, which is the one nobody remembers." | ✂ (line 132 already makes the pitch) |
| `services/pages/BizOrders.tsx:44` | "This page keeps itself current while it is open." | ✂ |
| `jobs/pages/Profile.tsx:284` | "Drop your CV in and we will read it into a professional profile — your roles, your qualifications and the things you have built, each one an entry you can edit." | "Drop your CV in — it becomes a profile you can edit, entry by entry." |
| `jobs/pages/Profile.tsx:322` | "These were read off your document and we were not certain about them. Until you confirm one, it is a reading rather than something you have said." | "Read from your CV, not yet confirmed by you." |
| `jobs/pages/Matches.tsx:123` | "We match roles to your parsed skills — add your resume to get started." | ✂ (heading + button say it) |
| `pay/pages/CreateInvoice.tsx:116` | "You can invoice a neighbour who has messaged this listing and chosen to show you their name. Until they do, you are talking to a customer number and there is nobody to address a bill to." | "Invoices go to neighbours who have messaged you and shown their name." |
| `pay/pages/BusinessInvoices.tsx:89` | near-duplicate of the above + payment methods | "Invoices go to neighbours who have messaged you and shown their name." |

## 5 · Chat, Mira, mail, profile, settings & personal — est. 480–560 words

| Where | Now | Proposed |
|---|---|---|
| `chat/mira/MiraThread.tsx:25` opening | "Tell me what you want done in the city and I'll do it — you don't need to know which page it lives on." | "Tell me what you want done in the city — I'll do it." |
| `MiraThread.tsx:26` | "Talking is enough; no hands needed." | ✂ |
| `MiraThread.tsx:31` | "— and taking you anywhere you ask for. Booking and paying come next; I'll say so rather than pretend." | ". Booking and paying come next." |
| `MiraThread.tsx:79` welcome 🔒 | "Talk to me however you like — you don't have to figure out which version of me you need." | "No need to figure out which version of me you need — just talk." (pinned fragment survives) |
| `MiraThread.tsx:140` error 🔒 | "I heard the city, but we are not speaking the same language yet — the app and the server are on different versions. Give the update a minute to land." | "We're not speaking the same language — the app is mid-update. Give it a minute." |
| `MiraThread.tsx:147` error | "The city answered with an error. It is not you, and it is not the connection." | "The city answered with an error — not you, not your connection." |
| `MiraThread.tsx:600` footer | "Today's conversation is kept with your account and shows on every device. Clearing takes it off this device only — she still has it." | "Saved to your account, on every device. Clearing only clears this screen." |
| `chat/mira/MiraConfidant.tsx:159` | "Ask me what's going on, where they're coming from, or for help saying what you mean." | ✂ (reads out the three chips below) |
| `MiraConfidant.tsx:224` footer 🔒 | "Mira sees only what's on this screen, and keeps none of it — close this panel and it's gone." | "Close this panel and it's gone." (pin satisfied at line 158) |
| `daybook/MiraDay.tsx:86` | "I can read this one day with you — what you put down, how you said it felt, what you wrote. Just this day, nothing around it." | "I can read this day with you — just this one, nothing around it." |
| `settings/pages/Settings.tsx:130` | "One neutral chassis for everything that governs how the city behaves for you." | ✂ |
| `Settings.tsx:152` appearance | 47-word rationale for repainting Mail and Chat | "Repaint Mail and Chat. Remembered per device — your phone and laptop can differ." |
| `settings/components/DeleteAccountCard.tsx:48` | "This permanently removes your Together City identity: your posts, photos, listings and social connections are erased, your profile stops existing for other citizens, and every device is signed out.…" | "Erases your posts, photos, listings and connections, and signs out every device. It cannot be undone. Type DELETE and confirm your password." |
| `profile/pages/MasterProfile.tsx:350` | 40-word relationship-status disclaimer | "Optional — nothing else in the city reads it, including dating." |
| `MasterProfile.tsx:427` | 46-word blood-group helper | "Optional. Shown on your health record; shared only with your consent." |
| `MasterProfile.tsx:442` | "All optional — and saving with nothing ticked is recorded as your answer, which is not the same as never being asked." | "All optional." |
| `MasterProfile.tsx:358` | "These set your calorie and nutrient targets. Leave one blank and we say so rather than working them out from somebody else's body." | "These set your calorie and nutrient targets." |
| `MasterProfile.tsx:312` | "Age is worked out from this rather than stored, so it is never out of date." | ✂ (keep "You are {age}.") |
| `profile/pages/Profile.tsx:287` | "One identity, and a page for every hub that reads from it. The data page is entered once — every hub in the city works from it, and nothing is asked for twice." | "Entered once — every hub in the city reads from it. Nothing is asked for twice." |
| `Profile.tsx:299` visas | "One page per hub, stamped by what that hub knows about you — and blank until you have been there, which is the honest way to show a hub you have never opened." | "One page per hub, stamped by what it knows about you — blank until you've been there." |
| `mail/pages/Folders.tsx:387` empty project | 41-word manual | "Mail sent from this project — and every reply — lands here. Move older mail in from All Email." |
| `Folders.tsx:380` no results | "Search looks at the sender, the recipients, the subject and the words in the message — in this folder." | ✂ |
| `Folders.tsx:238` confirm (+`MessageView.tsx:571`) | "Delete this forever? Trash is the last stop — there is nowhere to take it back from." | "Delete forever? This can't be undone." |
| `Folders.tsx:620` error (pattern ×3) | "Nothing has been deleted and nothing has moved — we couldn't reach your mailbox just now. Try again in a moment." | "Couldn't reach your mailbox — nothing's lost. Try again in a moment." |
| `Folders.tsx:627` | "It may have been deleted — which never deletes mail. Everything it held is in All Email." | "Deleting a project never deletes mail — it's all in All Email." |
| `Folders.tsx:552` | "Turning it off leaves the folder relying on the conversation being matched instead." | ✂ |
| `Folders.tsx:564` | "Finished with it? Archiving keeps the filing and stops new mail arriving here." | "Archiving keeps everything and stops new mail." |
| `mail/pages/Compose.tsx:308` | "You're not connected to anyone yet — city mail goes to your connections. You can still write to any external email address." | "No connections yet — but you can write to any email address." |
| `Compose.tsx:305` placeholder (+`MessageView.tsx:296`) | "a connection's @togethercity.app handle · or any email address" | "Handle or email address" |
| `Compose.tsx:369` partial failure | three sentences after the bolded headline | "It's in Sent — fix those addresses and resend. Recipients will get a second copy." |
| `Compose.tsx:480` status line | "Delivers to citizens and external emails · up to 1 GB of attachments" | ✂ |
| `chat/pages/Chats.tsx:515` error | "Every conversation is still there — this didn't reach us. Try again in a moment." | "Your chats are safe — try again in a moment." |
| `Chats.tsx:581` empty | "No conversations yet. Start one above, or open a member's profile and tap Message." | "No conversations yet — start one above." |
| `Chats.tsx:867` desk view | "Pick one on the left, start a chat, or message somebody from their profile." | "Pick a conversation, or start one." |
| `chat/components/Composer.tsx:124` | "Microphone access is off for this site. Allow it in your browser's settings to record a voice note." | "Microphone blocked — allow it in your browser settings." |
| `thoughts/pages/Thoughts.tsx:289` | "A private journal. Only you can read these — they never reach the social feed, and no one is notified." | "A private journal — only you can read it." |
| `Thoughts.tsx:366` error | "Nothing has been lost — every entry is still there, we just couldn't read them just now. Try again in a moment." | "Nothing has been lost — try again in a moment." |
| `Thoughts.tsx:375` empty | "Write the first thing above — it stays private to you." | "Write the first thing above." (third privacy promise on one screen) |
| `personal/pages/PersonalHome.tsx:186` | "Your journal, your week, your documents, your pictures and your money — the part of the city that belongs to you." | "Your journal, week, documents, pictures and money." (H1 already says "Yours, and only yours") |
| `personal/pages/Album.tsx:47` | "Every photo and video you have posted to the city, newest first. Only you are looking at this page." | "Every photo and video you've posted, newest first. Only you can see this." |
| `calendar/pages/Calendar.tsx:98` | "Open any day to keep it: how it felt, what was on it, what you want to remember." | "Open any day to keep it." |
| `connections/pages/Connections.tsx:142` error | "Your connections are unchanged — nobody has been added or removed. We couldn't read them just now." | "Couldn't load them just now — your connections are unchanged." |
| `connections/components/PendingRequestNotice.tsx:38` | "They chose these. Accepting opens exactly them — you can change them, or disconnect, any time afterwards." | "Accepting opens exactly these — change them any time." |
| `drive/pages/Drive.tsx:169` | "Upload a file or create a folder to get started." | "Upload a file or create a folder." |
| `calls/peer.ts:127` toast 🔒 | "The call could not connect. This usually means one of you is on a network that needs a relay server we have not set up yet." | "Couldn't connect — one of you is on a network that needs a relay server we don't have yet." |
| `profile/components/CitizenCard.tsx:92` | "Your photograph could not be included — it is served from somewhere the browser will not let us copy from. The card shows your initials instead." | "Your photo couldn't be included, so the card shows your initials." |
| `daybook/pages/DayPage.tsx:398` 🔒 | "That time is half-written — finish it, or clear it and add this without one." | "Finish or clear the half-written time first." |

## 6 · Dating, astrology & social — est. 900–1,100 words

| Where | Now | Proposed |
|---|---|---|
| `dating/pages/DatingProfile.tsx:681` ⚠ false claim | "Four short screens (~3–5 min). Matching is astrology-first; only matches scoring 75%+ are ever shown. Your profile passes a safety check before it goes live." | "Four short screens (~3–5 min). Your profile passes a safety check before it goes live." |
| `dating/pages/DatingMatchDetail.tsx:248` ⚠ contradiction | "Connecting opens an anonymous chat in the Dating Hub — up to three at a time. First 3 connections are free." | "Chat opens in the Dating Hub — up to three at a time. Your first 3 are free." |
| `dating/pages/DatingMatches.tsx:348` rail panel | "Up to {cap} conversations at once. If one isn't going anywhere, unmatch and move forward." | ✂ whole panel (identical rule already in the main column) |
| `dating/components/MatchCards.tsx:439` at-capacity | 50-word defence of the cap | "Intentional dating means {cap} conversations at a time. Your matches stay right here — unmatch one and the next chat opens." |
| `MatchCards.tsx:447` | "To start another, unmatch one of these first." | ✂ (restates the sentence above) |
| `MatchCards.tsx:320` | "You've liked them. They're notified only if you both like each other — and the moment they do, they move to Curated Matches and chat opens." | "You've liked them. They'll only know if they like you back — then chat opens in Curated Matches." |
| `MatchCards.tsx:420` histogram note | "Everyone here fits what you asked for. They are listed strongest first and grouped by category, so you can start at the top or go looking — the percentage is our reading of the two of you, and the choice is yours." | "Everyone here fits what you asked for, listed strongest first. The percentage is our reading — the choice is yours." |
| `dating/pages/DatingBrowse.tsx:143` 🔒 | "Nobody is hidden for scoring low — the percentage is our reading of the two of you, and the choice is yours. Like someone and they hear nothing; like each other and you both do." | "Nobody is hidden for scoring low. Like someone and they hear nothing; like each other and you both do." (both pins survive) |
| `DatingBrowse.tsx:158` info strip | "…that is where a match lives, and where chat opens." | "When you both like each other, they move to Curated Matches — and chat opens there." |
| `DatingBrowse.tsx:178` empty | "Your city is just getting started here. As more residents join, they appear on this page the day they do — everyone, not only the strong matches." | "New residents appear here the day they join — everyone, not only the strong matches." |
| `dating/pages/DatingMatches.tsx:299` empty | "A match is two people choosing each other, so this page fills up from the other room. Everyone in your city is in Potential Matches, with your compatibility on every card." | "This page fills up when someone likes you back. Everyone in your city is in Potential Matches — start there." |
| `DatingMatches.tsx:338` footer | "Looking for more? Potential Matches has everyone in your city, with your compatibility on every card." | "Looking for more? Browse Potential Matches." (third telling) |
| `dating/pages/DatingChats.tsx:358` | "Intentional dating — a few conversations, not endless ones. Everyone appears as themselves, with the same name and photos as their profile. These chats live only here, never in your main Chats." | "A few conversations, not endless ones. These chats live only here — never in your main Chats." |
| `dating/pages/DatingProfile.tsx:438` failed read | "Nothing has been lost. We're not showing you the form, because an empty one would look like a profile you never made — and saving it would replace the one you have. Try again in a moment." | "Nothing has been lost — we've kept the form closed so a blank one can't overwrite what you saved. Try again in a moment." |
| `DatingProfile.tsx:711` | "Mention your current location — where you live right now." | ✂ (label says both halves) |
| `DatingProfile.tsx:837` | "Choose the location you'd like your partner to be from. This can be anywhere." | ✂ (the chips are the sentence) |
| `DatingProfile.tsx:825` | "Someone further away than this still appears, scored lower — it shapes your matches rather than hiding people. If we don't recognise a city we leave this out rather than guess." | "Shapes scores rather than hiding people — someone further away still appears, scored lower." |
| `DatingProfile.tsx:867` | "No input needed — from your details we compute your compatibility for every candidate:" | "Computed from your details, for every candidate:" |
| `DatingProfile.tsx:669` ⚠ grammar | "Matches also see your live compatibility score with you." | "Matches also see their live compatibility score with you." |
| `dating/components/SafetyMenu.tsx:67` | "Neither of these tells them anything. They won't know you reported them, and a block looks to them like nothing happened." | "Neither tells them anything — a report is anonymous, and a block looks like nothing happened." |
| `SafetyMenu.tsx:94` | "Tell us what happened, in your own words. You don't have to — send it blank if you'd rather not write it out. A moderator reads this; they're never told who reported them." | "Optional — a moderator reads this, and they're never told who reported them." |
| `dating/pages/DatingActivity.tsx:110` | "Say what you want to do — the AI invites the most compatible people, and only they see it." | ✂ (page intro one scroll up says it) |
| `social/pages/SocialFeed.tsx:239` banner | "Real moments. Real people. Right now." | ✂ with its band (the feed is the proof) |
| `social/pages/Profile.tsx:891` Post & Earn | "We would rather tell you this plainly than show you a balance. There is no way to earn from your videos on Together City today — no rate, no review, no payout. The day that changes, you will be told, and it will be told to you here first." | "No way to earn from your videos today — no rate, no review, no payout. When that changes, you'll hear it here first." |
| `Profile.tsx:900` | "It is a real intention, not a promise with a date on it, and until it exists we are not going to quote you a figure." | "A real intention — not a promise with a date on it." |
| `Profile.tsx:916` | "Post them because you want to — they are posts on your profile, not submissions to anything." | ✂ (third repetition on one tab) |
| `Profile.tsx:976` followers empty | "No followers yet — share posts and connect with people to grow your circle." | "No followers yet." |
| `social/pages/CreatePost.tsx:862` | full Post & Earn paragraph again | "No rate, no review, no payout yet. When that changes, you'll be told here first." |
| `CreatePost.tsx:722` | "MP4 plays on every device, and photos are optimised automatically." | ✂ (keep the formats + size line) |
| `social/pages/Blocked.tsx:69` | 55-word block explainer | "Blocking hides you from each other everywhere — messages, calls, requests, matches, feed. They are not told. Unblocking is instant, but old connections and follows don't come back." |
| `Blocked.tsx:84` empty | "You have not blocked anyone. If you ever need to, it is on the citizen's profile, and they will appear here so you can undo it." | "You haven't blocked anyone." |
| `astrology/shared.tsx:11` gate card | "To write your personalised daily and monthly guidance, please add your birth details. This information is saved once in your Master Profile and automatically used across Together AI." | "Your guidance is written from your birth details — saved once, used across Together AI." |
| `shared.tsx:17` | "Already added these during onboarding or dating? They're reused automatically — you never enter them twice." | ✂ (if they were reused, the card wouldn't show) |
| `astrology/pages/AstroAsk.tsx:157` 🔒 | "Every answer is kept permanently under My Questions." | ✂ this line only (masthead pins are in the surrounding sentence and survive) |
| `AstroAsk.tsx:211` ⚠ spelling | "Ask about your current situation. The more specific your question, the more personalized your guidance will be." | "Your question — the more specific, the better." |
| `AstroAsk.tsx:246` fineprint | "…is charged once to your Together City Wallet and covers this consultation and the…" | "Charged once to your city wallet. Every answer is kept under My Questions." |
| `astrology/pages/AstroToday.tsx:78` pending | "It is written fresh each morning rather than assembled from parts, and that hasn't finished — so rather than hand you something that only looks like it, we would rather you came back in a little while." | "It's written fresh each morning and hasn't finished — check back in a little while." |
| `astrology/pages/AstroMonthly.tsx:71` pending | "It is written once, properly, rather than assembled from parts — and until it is, there is nothing here worth your time. Please come back a little later." | "It's still being written — come back a little later." |
| `astrology/components/Letter.tsx:202` | 40-word ask for two fields | "Your letter is written from when and where you were born. Add that once — it's shared everywhere you use it." |
| `astrology/pages/AstroTarot.tsx:222` | "Seven cards, face down. Take your time and turn one — whichever you choose is the card for your day, and it stays yours until midnight." | "Seven cards, face down. Turn one — it's yours until midnight." |
| `AstroTarot.tsx:369` masthead 🔒⚠ | "…same draw can be regenerated from its seed." | ✂ the seed sentence — **needs its test assertion removed on purpose** (`nothing-is-dealt-until-you-turn.test.ts`) |
| `astrology/pages/AstroGemstones.tsx:314` | "Your body weight, against the weight this stone is traditionally worn at." | ✂ (restates the paragraph above) |
| `AstroGemstones.tsx:446` | "Move this to whatever you have in mind. We spend it in the order above — the must-have first — and take the recommended stone whenever it fits, or the stand-in for the same planet when it doesn't." | "Spent in the order above, must-have first — the recommended stone when it fits, its stand-in when it doesn't." |
| `AstroGemstones.tsx:546` fine print | 70-word four-sentence caveat | "Stones only, at each one's starting grade and your prescribed weight. A ring or pendant adds gold that can cost more than the stone — that's priced in the studio, where these buttons go." |
| `astrology/pages/GemStudio.tsx:278` | "Indian sizes. Measure at the end of the day, when fingers are largest — and if your knuckle is wider than the base, size for the knuckle and take the nearer size up." | "Indian sizes. Measure at the end of the day; if your knuckle is wider, size for the knuckle." |
| `astrology/pages/AstroProfilePage.tsx:575` | 40-word privacy body under "Your birth details are private." | "Used only for your readings and compatibility. Never shown publicly, never shared unless you choose to." |

## 7 · Beauty, fitness, entertainment & travel — est. 650–750 words

| Where | Now | Proposed |
|---|---|---|
| `beauty/pages/Profile.tsx:714` hero | "A personalised assessment of your skin, hair and unique needs — created to build a routine that works for you." | "Your skin and hair, read — and a routine built from the reading." |
| `Profile.tsx:749` (+dup :865) | "Share your skin, hair and personal details so we can create your personalised assessment." | "Two photos and a few answers — the assessment comes from these." |
| `Profile.tsx:825` budget blurb | "Set your budget and let us personalise your beauty, wellness and care routine within your comfort." | "Your routine is built inside this number — never over it." |
| `Profile.tsx:759` photo tips | "Bare face and scalp, good even light, and take them however suits you — the camera here, a file, or dragged onto a tile." + triple privacy tail | "Bare face, even light. Camera, file, or drag one in." + "never shared, never used for anything but your analysis." |
| `Profile.tsx:45` follow-up | "upload a new set of photos to measure your progress. Optional, whenever you're ready." | "new photos will measure your progress — whenever you're ready." |
| `Profile.tsx:125` biomarker empty | biochemistry seminar with four markers and two examples | "we'll link markers like ferritin and HbA1c to your skin & hair — low ferritin → shedding, for example." |
| `Profile.tsx:157` | "✓ No biomarker flags are affecting your skin or hair right now — a good foundation." | "✓ No biomarker flags affecting your skin or hair." |
| `Profile.tsx:785` confirm | 37-word delete dialog | "Delete your latest check-in? Your current assessment clears until you re-analyse. Earlier entries stay; no weekly analysis is refunded." |
| `Profile.tsx:871` banner | "Photos uploaded successfully. Now complete your Skin & Hair Profile to generate your personalised AI assessment." | "Photos in. Finish your profile to unlock your assessment." |
| `beauty/pages/Routine.tsx:562` | "We would rather say so than let the chip stand for an answer." | ✂ |
| `Routine.tsx:514` | "shelf prices can't always land exactly on your number, so we allow up to five per cent, and never more than that." | "shelf prices can't always land exactly on your number — we allow up to five per cent over, never more." |
| `Routine.tsx:588` | "Past about {…} this shelf stops being able to match you better — above that the money buys a dearer version of the same answer, not a closer one." | "Past about {…}, extra money buys a dearer version of the same answer — not a closer match." |
| `Routine.tsx:608` | "We've built what fits and put the most important steps in first. Nothing has been changed on your behalf." | "We've built what fits, essentials first. Nothing has been changed on your behalf." |
| `Routine.tsx:614` 🔒 | "We've built the best one that fits instead — we won't go over your budget without asking." | "This is the best one that fits — we won't go over your budget without asking." (pin kept verbatim) |
| `Routine.tsx:648` | 40-word second useful-max paragraph | "This shelf tops out at about {…} for your profile; you've set {…}." (reasoning already on the BudgetPanel dial) |
| `Routine.tsx:821` gate | 45-word budget-gate body | "Face, hair and body each get their own limit, and nothing is chosen that goes over it. Set it on your Skin & Hair Profile." |
| `Routine.tsx:990` masthead foot | "Built from your saved skin and hair profile, what you told us you want to work on… — what to use, in what order, and when. Anything you've told us you react to is left out." | "Built from your profile, your goals…. Anything you react to is left out." |
| `beauty/components/BudgetPanel.tsx:260` | "Set what you're comfortable handing over for this routine. We'll build it around that." | ✂ (next paragraph says it with the rules) |
| `BudgetPanel.tsx:264` | "Your budget is what the routine may cost to buy. We'll prioritise the products that matter most and keep your routine lean. Leave a category at nothing and we'll leave it out altogether." | "Your budget is what the routine costs to buy. Leave a category at nothing and it's left out altogether." |
| `BudgetPanel.tsx:253` | "Your profile suggests your face routine should prioritise {…}. Set your budget and we'll prioritise accordingly." | "Your face routine will prioritise {…}." |
| `BudgetPanel.tsx:184` | "everything past that either repeats what your routine already carries or doesn't address anything you told us about, so the rest of the {…} you've set can't be spent." | "past that, products only repeat your routine or miss your concerns — the rest of your {…} can't be spent." |
| `BudgetPanel.tsx:307` | "We'll never recommend products that push your routine beyond your selected budget without asking you first." | "We never go past your budget without asking first." |
| `beauty/pages/Makeup.tsx:155` hero | "Your personal AI makeup artist — looks built from your face analysis, skin, colouring and the occasion. Blood biomarkers play no part here." | "Looks built from your face analysis, colouring and the occasion." (trust strip already says "No biomarkers in makeup") |
| `Makeup.tsx:252` | "Each pick has a lower-cost and premium option." | ✂ (the compare button on every card says it) |
| `Makeup.tsx:282` ×11 cards | "Why we recommended this:" | "Why this:" |
| `Makeup.tsx:359` kit footnote | 50-word shopping-list explainer | "Together City doesn't sell makeup yet — this kit is a shopping list to take wherever you already shop. We'll tell you the day that changes." |
| `beauty/pages/Orders.tsx:62` 🔒 | "Everything you've added, from the routine and the market alike. Nothing is charged until you pay, and it stays here until you remove it." | "Nothing is charged until you pay." ("city wallet" pin stays on the pay button) |
| `fitness/pages/Workout.tsx:308` | "Your personalised home & gym plan for today — level & goal matched, with a live guided timer." | "Today's session, matched to your level and goal — with a live timer." |
| `Workout.tsx:448` | "Start the timer and Together City guides you exercise-by-exercise. You can pause, skip an exercise, jump to the walk, or end anytime." | "The timer guides you exercise-by-exercise." |
| `Workout.tsx:445` button | "🚶 Skip workout — just walk ({N} min)" | "🚶 Just walk ({N} min)" |
| `Workout.tsx:279` confirm | "Skip all activity today? You will be marked as no physical activity." | "Skip today? It logs as no activity." |
| `fitness/pages/Store.tsx:286` error | "Nothing was lost and nothing was charged. An empty shop here would read as "there is nothing worth taking", which is a claim we haven't checked." | "Nothing was lost and nothing was charged." |
| `Store.tsx:209` refused note | 42-word argument | "On sale here so the trials stay in front of you — the checkout asks you to read them once before taking any money." |
| `Store.tsx:363` empty search | catalogue trivia about folate, L-theanine and K2 | "Try another spelling, a brand, or clear the filters." |
| `fitness/pages/Supplements.tsx:283` error | "…An empty plan here would read as "you need nothing", which is a claim we haven't checked." | "Nothing has changed and nothing was lost — we couldn't reach your health data just now." |
| `Supplements.tsx:333` | 55-word third telling of the refused-bucket rule | "No price and no button here, on purpose. They're still in the store — the checkout there asks you to read the trial first." |
| `fitness/pages/Orders.tsx:123` | "Still listed rather than deleted — a bag that quietly empties itself is a bag that lies about what you asked for." | ✂ (preceding sentence states the fact) |
| `Orders.tsx:214` | "Each line is what it cost on the day you bought it. A receipt that changes when a shelf price changes is not a receipt." | "Prices are what you paid on the day." |
| `Orders.tsx:165` button | "Pay {…} from your city wallet" | "Pay {…}" |
| `fitness/pages/Profile.tsx:240` | "Tell us what you actually have. If you have nothing, say so — a bodyweight session built on purpose beats one built on a guess about your dumbbells." | "Tell us what you actually have — "nothing" is a real answer, and gets a bodyweight session built on purpose." |
| `Profile.tsx:292` toast | "Fitness profile saved successfully." | "Profile saved." |
| `fitness/pages/Sleep.tsx:116` hero | "Track how long and how well you sleep, keep a steady bedtime, and see how rest feeds your Health Score, recovery and nutrition." | "How long and how well you sleep — and what a steady bedtime buys you." |
| `Sleep.tsx:141` | "Nothing logged yet. Add last night below and this fills in — we would rather start empty than show you a week you did not sleep." | "Nothing logged yet — add last night below." |
| `Sleep.tsx:211` watch card | 72-word manual-logging confession | "Together City can't read your watch or health app yet — no Apple Health, Google Fit, Fitbit or Samsung Health. Logging is manual for now, and your nights are kept on this device only." |
| `Sleep.tsx:236` foot | "◈ Rest is part of training. Your Health Profile reads your sleep to tune recovery days, calorie needs and workout intensity." | ✂ (restates the two cards above) |
| `fitness/pages/BodyGoal.tsx:39` | "One systematic program across workout, nutrition and your health data." | ✂ |
| `entertainment/pages/Movies.tsx` hero | "Decide what to watch in one place — theatres and OTT together, instead of scrolling a hundred different apps." | "Theatres and OTT, one place." |
| `entertainment/pages/Ott.tsx` hero | "Lock tonight's show in one place — search everything, browse by genre, see where it streams." | "Lock tonight's show — and see where it streams." |
| `Ott.tsx` placeholder | "🔍 Search any show or movie across all platforms…" | "🔍 Search shows & movies…" |
| `entertainment/pages/movieKit.tsx:345` | "Every platform carrying this title in India — tap to jump straight in." | "Every platform carrying this title in India." |
| `entertainment/pages/Curated.tsx` sidebar | "Why Curated?" and "Tap any film" cards | ✂ both (they re-describe the shelves and teach card-tapping) |
| `entertainment/pages/Watchlist.tsx` empty | "Tap the bookmark on any movie or show — in Movies Now, OTT Watch, Curated or search — and it lands here instantly." | "Tap the bookmark on any movie or show — it lands here." |
| `Watchlist.tsx` footer | "Saved to your Together City account — synced on every device. Data & images: TMDB." | "Data & images: TMDB." (trust bar already says synced) |
| `travel/pages/Bookings.tsx:76` ⚠ | "View and manage all your travel bookings in one place." | "Every booking, in one place." |
| `Bookings.tsx:79` | 55-word cancellation note ending "We'd rather point you somewhere that works than put a button here that doesn't." | "We can't change or cancel bookings inside Together City yet. Take the booking reference above to the airline or trip operator — they can act on it today." |
| `travel/pages/Packages.tsx` hero | "Curated travel experiences, all in one place." | "Trips worth packing for." |
| `travel/pages/Explore.tsx` error (+Packages twin) | "This didn't reach us — it isn't that there's nowhere to go. Try again in a moment." | "This didn't reach us. Try again in a moment." |

---

## Applying it

The natural order, if approved: **(1)** the five wrong-not-long fixes; **(2)** the two shared
components every form renders (`form-validation.tsx`); **(3)** the per-hub sweeps, one commit
per hub so each is revertable; **(4)** the one deliberate test edit (tarot seed sentence) in
its own commit; **(5)** full suite run — the pinned fragments listed above are preserved by
design, so everything should stay green. Approve the lot, approve by area, or strike any row —
each line lands exactly as written here.

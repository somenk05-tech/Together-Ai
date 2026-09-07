# One pack per supplement, inside a number the citizen set — 5 Sep

**The ask (owner, 5 Sep):** "supplements show only one option for supplement based on budget — let user set budget." The Personalized Store's supplement shelf (`/ecommerce/shop/supplements`) drew every product under every shortlisted supplement — ten omega-3 bottles for one triglyceride result. That is a catalogue wearing a badge, not a shortlist. Decisions taken with the owner: the budget is **₹ a month, total**, typed as a number; it lives on the **Training Profile** (server), so the E-commerce shop, the Fitness shelf and Mira all read one figure.

**What lands** — `land-one-pack-per-supplement.sh`, one commit after `land-a-credential-that-expires-is-created.sh`.

The kit is the server's (`together-city-chat/src/fitness/supplements/kit.ts`), computed inside `GET /fitness/store` beside the badges it is drawn from, so no screen can pick a different bottle than another. One sellable pack per priority/consider supplement — `optional` and `not-recommended` never enter it. Which pack: the review's own quality tags decide (third-party tested, published CoA, heavy-metal tested, named certifier count for; partly verified, composition unverified, verify dose and kin count against) and price is only the tie-break, cheaper first. The most expensive bottle is not the best one and nothing here implies it is.

Under a budget the kit fills priority-first; each supplement takes the best pack that still leaves the cheapest pack for everything to come, so a premium tub early never costs a supplement later. When even the cheapest of everything does not fit, the last supplements are dropped (consider before priority) and **named**, with the price that brings each back. Without a budget the kit is still one pack per supplement — the best-quality one — and the shelf says a number would change it. Zero is a cap of nothing; null is no cap.

One pack is counted as one month, and the page says so in those words. The catalogue records a price and a pack, not servings, and a days-per-pack figure would be a dose this app has promised never to calculate.

The number: `FitnessProfile.supplementBudgetInr` (migration `20260905T180000_a_budget_for_the_kit`, deploys on Railway's pre-deploy step), set by `PUT /fitness/store/budget { monthlyInr: number | null }` — whole rupees, ≤ 1,00,000, null clears. It does not touch `answeredAt`, so setting a budget cannot make an unanswered profile look answered to the session engine.

The web: the storefront shell gains a `budget` slot (a label, a number, a total, a list of names, a note — nothing about packs) and draws one control above the shelf, even when the shelf is empty: type, save on blur or Enter, Clear for no cap. Under it, the kit's total against the number, the one-pack-one-month sentence, and what the number could not reach. `useFitnessShop` draws the kit's picks in the kit's order (falling back to the whole shortlist only on an older API build that sends no kit). The Fitness hub's own Supplements page marks the same pick **Your pick** under each card and links to the shop to change the number.

Gates on the Mac: kit spec 14/14, web `tsc`, vitest 157 files / 1,348, all ten ratchets, vite build. API `tsc` needs `prisma generate` for the new column — the script runs it; the VM cannot.

**Related:** the trial-plan note on Metered and the Railway red build are in `The-Launch-Gate-Third-Reading-4-Sep.md`.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Fold, Spinner } from '@/components/ui';
import {
  bagKey, useBagActions, useBeautyProfile, useBeautyRoutine, useSaveBeautyBudget,
  type CategoryPlan, type ProductRoutine, type ProductRoutineStep, type RoutinePick, type RoutineTier,
} from '../api';
import { BeautyBagBar } from '../components/BeautyBagBar';
import { NextOrder } from '../components/NextOrder';
import { ProductShot } from '../components/ProductShot';

/**
 * The routine, as a thing you could print and pin up.
 *
 * WHAT THIS REPLACED was a correct list nobody would read: three stacked cards
 * of numbered rows, all the same weight, no prices worth noticing and no way to
 * buy any of it without leaving for the Market. The owner sent a reference — an
 * editorial AM & PM sheet, two columns side by side, a photograph against every
 * step, and a basket for the whole thing — and this is that composition in the
 * city's own material.
 *
 * WHAT IS THE REFERENCE'S AND WHAT IS NOT, said plainly because the difference
 * is deliberate:
 *   · TAKEN — the masthead, the two columns, the numbered rows with a picture
 *     and a price, the basket for the whole routine, the assurance strip.
 *   · NOT TAKEN — its cream ground and bronze rule. Beauty's accent is the
 *     city's plum and the ground is the city's paper; a hub re-grounding itself
 *     is a decision for tokens.css and five hubs have earned it, not six.
 *   · NOT TAKEN — "You save ₹1,225". There is no MRP in the catalogue, so that
 *     figure could only have been invented. The total is real and stands alone.
 *
 * FOUR BANDS, NOT TWO. Morning and evening sit side by side as in the
 * reference; weekly and body run full width beneath them. The reference had
 * nowhere for a wash day or a hand cream and the shelf has seventeen hair
 * products and fifteen body ones — dropping them to match a picture would have
 * been redesigning the product to fit the mock.
 */

const BAND: Record<ProductRoutine['timeOfDay'], { icon: string; sub: string }> = {
  morning: { icon: '☀', sub: 'Protect & hydrate' },
  evening: { icon: '☾', sub: 'Repair & nourish' },
  weekly: { icon: '✦', sub: 'The longer jobs' },
  body: { icon: '◈', sub: 'Everything below the jaw' },
};

/** Grouped the way rupees are grouped here: ₹8,613, not ₹8613. Only the two
 *  display totals use it — a step price is three or four digits and reads
 *  better bare, which is how the Market has always printed them. */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * ── WHAT A ROUTINE COSTS, AND FOR HOW LONG ─────────────────────────────────
 *
 * THE PURCHASE PRICE IS THE MISLEADING NUMBER, and until now it was the only
 * one on this page. Four products at ₹284, ₹569, ₹408 and ₹474 read as ₹1,735
 * spent this month against a budget of ₹5,000 — comfortable. It is nothing of
 * the sort in either direction: the cleanser is a hundred millilitres and lasts
 * a month and a half, the sunscreen at the honest dose is gone in six weeks,
 * and the serum will still be there at Christmas. So the monthly figure sits
 * beside every price on this page and always will.
 *
 * IT IS NO LONGER WHAT THE PLAN IS BUILT ON. The owner reversed that on 15 Aug:
 * a budget is what somebody hands over at the counter, so the planner spends
 * PURCHASE PRICES and the upkeep number decides nothing. The two units are one
 * word apart in the copy — "₹8,000" and "₹8,000 a month" — and this page went
 * on saying the second about the first for two commits after the change, in
 * fourteen places. A unit lives in the strings as much as in the arithmetic.
 *
 * AND IT SHOWS ITS WORKING. "₹1,099 ≈ ₹366/month" invites the question "says
 * who?", so every step carries the pack and the answer — "one 88 ml pack —
 * about 3 months". That sentence is the difference between a number somebody
 * believes and a number they scroll past. Both phrases come from the server
 * finished; see `RoutinePick` for why they are not recomputed here.
 */
const TIER_LABEL: Record<RoutineTier, string> = {
  essential: 'Essential', 'high-value': 'High value', optional: 'Optional',
};

/**
 * One step: the number, the picture, what it is, what it costs and how long it
 * lasts.
 *
 * The picture is `ProductShot`, shared with the market — it is hotlinked to a
 * retailer's CDN and walks primary → alternate → category mark — though the
 * middle step has no data: the 2026-08 catalogue is built from each brand's
 * own storefront, one source per product by construction, so `imageAlt` is
 * empty on all 1,841 rows. In practice this is primary → mark. The path stays
 * live for the day a sheet supplies second sources, and
 * `catalog-is-shoppable.spec.ts` holds the ratchet that says so. Two copies of
 * that fallback would have been two behaviours the day one of them was fixed.
 */
/**
 * ONE PRODUCT, ONE PLACE TO BUY IT.
 *
 * A cleanser used morning AND evening is ONE bottle, and it appeared as two
 * steps each with its own quantity control. The bag was never wrong — both
 * controls edited the same line, keyed by productId — but the page said
 * otherwise twice over: two "Add to bag" buttons for one purchase, and after
 * adding, two steppers reading "1" that a reasonable person reads as two
 * bottles, or as two things they now have to keep in step by hand.
 *
 * So the SECOND appearance says where the first one is instead of offering to
 * buy the thing again. The step keeps everything else — its number in the
 * order, its own instruction, its own frequency, because "massage into damp
 * skin" at night is still a thing you do at night.
 *
 * `alreadyIn` is the band it was first seen in, not a boolean, because "already
 * in your bag" answers the wrong question. What somebody wants to know when a
 * product turns up twice is whether they have missed a second one to buy, and
 * the answer to that is a place: it is the same bottle as step 1 this morning.
 */
/**
 * WHAT WAS HERE AND IS NOT: a refresh control on the photograph that cycled the
 * step through the other products that could fill it. It worked and it came out
 * at the owner's word, 17 Aug — a round arrow on a product shot is not
 * self-explanatory, and a page whose whole argument is that the choosing has
 * already been done should not open the choosing again in its top-right corner.
 * The Market is where somebody browses; this sheet says what to use.
 */
function Step({ s, pick, qty, alreadyIn, onAdd, onRemove }: {
  s: ProductRoutineStep; pick?: RoutinePick; qty: number; alreadyIn?: string;
  onAdd: () => void; onRemove: () => void;
}) {
  /**
   * ── A STEP YOU OWN, WITH NOTHING WE COULD PUT IN IT ───────────────────────
   *
   * `s.owned` used to mean "no product": the planner declined to buy a role the
   * citizen had ticked, and this card held the position so the sequence did not
   * silently lose a step. Owner, 22 Aug: the routine shows the best product for
   * a person's skin at every step whatever they own, so `s.owned` now means
   * "we heard you, and here is one anyway" and the card below renders it.
   *
   * THE TEST IS THE PRODUCT ID, NOT THE FLAG. What is left for this branch is
   * the case that has no product to show — a role they own that nothing on the
   * shelf matched, or that the budget could not reach. That is still a real
   * position in the order, and dropping it is how the routine ended up with no
   * cleansing step at all: a morning of Prep → Treat → Moisturise → Protect
   * and an evening that never washed off the morning's SPF.
   *
   * It has a number and a name and nothing else, because there is nothing else
   * true about it. A card-shaped placeholder with grey boxes where a
   * photograph and a price would go is the page pretending to know something.
   */
  if (s.owned && !s.productId) {
    return (
      <li className="routine-card is-owned">
        <div className="routine-body">
          <div className="routine-top">
            <span className="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {s.order}. {s.step}
            </span>
            <span className="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em',
              borderRadius: 'var(--r-full)', padding: '2px 7px', border: '1px solid var(--line)' }}>Yours</span>
          </div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '6px 0 0' }}>{s.ownedWhy}</p>
        </div>
      </li>
    );
  }

  return (
    <li className="routine-card">
      {/* THE PICTURE FIRST, AND BIG. The owner's catalogue sheet is a well of
          paper with the product photographed in it and everything else written
          underneath, and on a page whose job is "go and buy these eight things"
          the photograph is the identifier — it is what somebody matches against
          a shelf. At 62 square it told you a bottle from a tube and nothing
          else. Every fact the old row carried is still here, below. */}
      <div className="routine-well">
        <span aria-hidden className="routine-num">{s.order}</span>
        <ProductShot image={s.image} imageAlt={s.imageAlt} name={s.name} category={s.category} fill />
      </div>

      <div className="routine-body">
        <div className="routine-top">
          <span className="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>{s.step}</span>
          {/* WHY THIS STEP IS HERE, in one word. The plan sorts everything into
              three tiers and acts on them — essentials go in first and are never
              dropped for a nicer optional — so saying which is which is telling
              somebody how their own routine was reasoned, not decorating it. */}
          {pick && (
            <span className="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em',
              borderRadius: 'var(--r-full)', padding: '2px 7px',
              background: pick.tier === 'high-value' ? 'var(--accent-soft)' : 'transparent',
              color: pick.tier === 'high-value' ? 'var(--accent-ink)' : undefined,
              border: pick.tier === 'high-value' ? '1px solid var(--accent-line)' : '1px solid var(--line)' }}>
              {TIER_LABEL[pick.tier]}
            </span>
          )}
        </div>

        {/* WE HEARD YOU, AND WE PICKED ONE ANYWAY.
            The citizen ticked this role on their profile. Until 22 Aug that
            meant the step was not bought; it is bought now, at the best match
            on the shelf, on the owner's call that the routine shows the best
            products for a person's skin whatever they say they own.
            This line is what stops that being a silent reversal — the form
            asked a question, and the answer has to come back somewhere or the
            form was a bin with a label on it. It sits above the price
            deliberately: the sentence a person needs before they read a number
            is the one explaining why there is a number at all. */}
        {s.owned && s.ownedWhy && (
          <p className="muted routine-owned">{s.ownedWhy}</p>
        )}

        {/* A REPEATED BOTTLE IS NOT A SECOND PRICE. The evening cleanser is the
            morning cleanser, and printing ₹8,616 against it a second time is the
            page inviting somebody to add up a routine that costs half what the
            column implies. The foot already says where the first one is; the
            money is said once, where it is spent. */}
        {alreadyIn ? (
          <div className="muted" style={{ fontSize: 11.5 }}>Counted in your {alreadyIn.toLowerCase()} routine</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {/* GROUPED, like every other rupee figure on this card. The bare form
                was a deliberate choice while a step price was three or four
                digits and the only place it appeared. It is neither now: the
                shelf carries ₹8,616 products, and the fold underneath prints
                that same number as "₹8,616 to buy" a centimetre below. One
                number in one card in two formats is not a style, it is a bug. */}
            <span className="routine-price">{rupees(s.priceInr)}</span>
            {pick && <span className="muted" style={{ fontSize: 11 }}>≈ {rupees(pick.monthlyInr)}/month to keep</span>}
          </div>
        )}
        {/* THE NAME IS NOT A LINK ANY MORE, at the owner's word, and the
            reasoning it replaces is worth keeping: it used to open the
            retailer's page, on the argument that a routine which names a
            product you then have to search for is homework.

            What changed is the page around it. The card now carries the
            photograph, the brand, the size, how long it lasts and the price —
            it IS the product page — and the one thing this hub wants somebody
            to do next is add it to the bag, which is the button directly
            underneath. A title that quietly leaves for Nykaa is a shop showing
            you the door on the way to its own checkout. `productUrl` stays on
            the wire and stays used in the Market, where browsing OUT is what
            the page is for. */}
        <div className="routine-name">{s.name}</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{s.brand}{s.keyIngredient ? ` · ${s.keyIngredient}` : ''}</div>

        {/* ── WHY THIS, HOW TO USE IT, AND WHAT IT COSTS TO KEEP ─────────────
            FOLDED, AND EVERY WORD OF IT KEPT. Eight cards each printing four
            paragraphs made a sheet nobody could scan: the thing somebody is
            looking for on this page is which bottle, in what order — and the
            reasoning, which is the best thing this hub has, was the reason
            they had to scroll past it. So the card answers WHAT and the fold
            answers WHY, and the fold names what is inside it rather than
            saying "more", because a section that only says its own name is a
            section nobody opens.

            IT IS THE SHARED `Fold`. A disclosure is four things done together
            — the state, the id, `aria-expanded`, `aria-controls` — and a
            second implementation still looks correct while it stops announcing
            itself. `routine-why` is this card's skin on the city's one
            behaviour.

            THE CAUTIONS DID NOT COME IN HERE, and that is the one deliberate
            exception. "Increases sun sensitivity — daily sunscreen is not
            optional alongside this" is the only alarm this hub allows itself,
            and an alarm behind a disclosure is a decoration.

            THE META IS THE PACK AND NOTHING ELSE. It was the pack AND how long
            it lasts — "30 ml · about 4 weeks" — and measured on the live page
            fifteen of the sixteen cards truncated it mid-word: the column is
            273px and the line had 101px of text in 77px of room. A closed
            section whose one line ends in an ellipsis reads as broken rather
            than as folded. The duration is inside, under what it costs. */}
        <Fold face="routine-why" panel="routine-why-open"
          title="Why this step"
          meta={pick?.packLabel || s.frequency.toLowerCase()}>
          {pick && pick.reasons && pick.reasons.length > 0 && (
            <ul className="routine-why-list">
              {pick.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <div className="routine-why-head">How to use it</div>
          <p className="routine-why-body">{s.instructions}</p>
          <div className="muted routine-why-note">{s.frequency}</div>
          {/* The working behind the monthly figure. Without it "≈ ₹366/month"
              is an assertion; with it, it is arithmetic anybody can check. */}
          {pick && (
            <>
              <div className="routine-why-head">What it costs to keep</div>
              <p className="routine-why-body">
                {pick.packLabel ? `One ${pick.packLabel} pack — ${pick.lastsLabel}` : `Lasts ${pick.lastsLabel}`}
                {` · ${rupees(pick.priceInr)} to buy`}
                {` · ≈ ${rupees(pick.monthlyInr)}/month to keep going.`}
              </p>
            </>
          )}
        </Fold>

        {s.warnings.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.warnings.map((w) => (
              <li key={w} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 8, padding: '6px 10px' }}>{w}</li>
            ))}
          </ul>
        )}

        <div className="routine-foot">
          {alreadyIn ? (
            <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden>↑</span>
              The same bottle as your {alreadyIn.toLowerCase()} routine
              {qty > 0 ? ` — ${qty} in bag` : ' — add it there'}
            </span>
          ) : qty > 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Button variant="line" size="sm" onClick={onRemove}>–</Button>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{qty}</span>
              <Button variant="line" size="sm" onClick={onAdd}>+</Button>
              <span className="muted" style={{ fontSize: 11.5 }}>in bag</span>
            </span>
          ) : (
            <Button variant="line" size="sm" onClick={onAdd}>Add to bag</Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * ── ONE BAND, IN THREE ROWS ─────────────────────────────────────────────────
 *
 * THE HEADING, THE NOTE, THE STEPS — and they are three wrappers rather than a
 * loose stack because morning and evening have to line up with each other. They
 * did not: the evening band carries the vitamin C / retinoid note and the
 * morning one does not, so the whole of the evening column started 55px below
 * the morning column and every row after it was out by the same amount. Two
 * columns that do not share a baseline read as two lists that happen to be
 * adjacent, which is exactly what the divider between them exists to deny.
 *
 * The alignment itself is `subgrid`, in layout.css — the rows belong to
 * `.routine-day` and both bands take their heights from it, so a note on one
 * side reserves the same space on the other. The note row is rendered whether
 * or not there is a note in it, because a row that only sometimes exists is a
 * row the two columns only sometimes agree about.
 */
function Band(
  { r, picks, bagged, seen }:
  {
    r: ProductRoutine; picks: Map<string, RoutinePick>; bagged: ReturnType<typeof useBagActions>;
    /** productId → the band that already offered it. Built once by the page, in
     *  band order, so "first" means first on the page rather than first
     *  alphabetically or whatever order the API happened to return. */
    seen: Map<string, string>;
  },
) {
  const meta = BAND[r.timeOfDay];
  return (
    <section className="routine-band">
      <div className="routine-band-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, paddingBottom: 4 }}>
          <span aria-hidden style={{ fontSize: 15, color: 'var(--accent-ink)' }}>{meta.icon}</span>
          <h2 style={{ fontSize: 15, margin: 0, textTransform: 'uppercase', letterSpacing: '.09em' }}>{r.title}</h2>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
            {r.steps.length === 0 ? 'nothing yet' : `${r.steps.length} step${r.steps.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>{meta.sub}</div>
      </div>

      <div className="routine-band-note">
        {r.notes.map((n) => (
          <p key={n} style={{ fontSize: 12.5, lineHeight: 1.55, margin: '8px 0 0', background: 'var(--paper)', borderRadius: 'var(--r-1)', padding: '9px 12px' }}>{n}</p>
        ))}
      </div>

      {r.steps.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
          Nothing here yet — as your profile fills in, steps appear.
        </p>
      ) : (
        <ul className="routine-grid" style={{ listStyle: 'none', padding: 0 }}>
          {r.steps.map((s) => (
            <Step key={s.productId} s={s} pick={picks.get(s.productId)} qty={bagged.qtyOf(s.productId)}
              alreadyIn={seen.get(s.productId) === r.title ? undefined : seen.get(s.productId)}
              onAdd={() => bagged.add(s.productId)} onRemove={() => bagged.remove(s.productId)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * ── ONE CATEGORY'S MONEY ────────────────────────────────────────────────────
 *
 * THREE NUMBERS AND A BAR, and the bar is the reason the numbers are readable
 * at a glance: ₹4,250 against ₹5,000 means nothing until you have seen how full
 * it is. It is drawn in the hub's own accent on a hairline track — NOT in red
 * approaching the end and NOT in green while there is room. A budget you have
 * nearly spent is not a warning; it is a budget working. The only alarm in this
 * hub is reserved for something that could hurt somebody's skin, and spending
 * ₹4,250 of ₹5,000 is not that.
 *
 * IT CANNOT OVERFLOW, and that is by construction rather than by clamping. The
 * planner never takes a product it cannot afford, so `monthlyInr` is at most
 * `budgetInr` and the fill is at most full. If this ever renders past the end,
 * the bug is in the planner and the bar is telling the truth about it.
 *
 * THE SHORT BUDGET IS THE INTERESTING CASE. When the essentials do not fit, the
 * plan reports what they would cost and the card asks — it does not adjust. Two
 * buttons, both explicit: keep the number you chose, or raise it to the one
 * that works. Silently moving somebody's budget to make our answer fit is the
 * single thing this feature was built to refuse.
 *
 * AND MONEY LEFT OVER IS NOT A GAP TO FILL. A ₹4,250 routine against ₹5,000 is
 * finished, not 85% finished. The line under the bar says so in as many words,
 * because every shop the citizen has ever used says the opposite.
 */
const CATEGORY: Record<CategoryPlan['category'], { label: string }> = {
  face: { label: 'Face' }, hair: { label: 'Hair' }, body: { label: 'Body' },
};

/**
 * THE STRIP UNDER THE CATEGORY NAME IS THE PLAN, NOT A DESCRIPTION OF ONE.
 *
 * It was three constants, and all three were read as derived because they sit
 * directly above the product count, which is. Live, on the owner's own profile,
 * FACE said "Cleanse · treat · moisturise · protect" over a routine with no
 * cleanser in it — the citizen had told us they already own one — and HAIR said
 * "scalp" over a plan with no scalp step at any budget. A line that names a step
 * the plan does not contain is the page telling somebody they bought something
 * they did not.
 *
 * KEPT ROLES COUNT. A step somebody already owns is still in their routine; it
 * is only not in their basket. So it is listed, and marked, rather than dropped
 * — which is the same reasoning as the `kept` list further down this card.
 */
const roleStrip = (c: CategoryPlan) => {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const r of [...c.picks.map((p) => p.role), ...c.kept.map((k) => `${k.role} (yours)`)]) {
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(r.toLowerCase());
  }
  return parts.join(' · ');
};

/** A finding key as a person would read it: 'dark-spots' → 'Dark spots'. */
const needLabel = (k: string) => {
  const words = k.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function BudgetCard(
  { c, kept, onKeep, onRaise, raising }:
  { c: CategoryPlan; kept: boolean; onKeep: () => void; onRaise: (n: number) => void; raising: boolean },
) {
  const meta = CATEGORY[c.category];
  // The REAL percentage, which can pass 100 — the fill is capped, the number is
  // not. A bar that stops at full while the figure says 102% is a bar telling
  // the truth; a figure clamped to 100 would be the page hiding the headroom it
  // just used.
  const pct = c.budgetInr > 0 ? Math.round((c.spendInr / c.budgetInr) * 100) : 0;
  /** The dearest bottle to keep, when it is more than half the upkeep. */
  const dominant = c.picks.length > 0 && c.monthlyInr > 0
    ? [...c.picks].sort((a, b) => b.monthlyInr - a.monthlyInr)
      .filter((p) => p.monthlyInr * 2 > c.monthlyInr)[0]
    : undefined;
  const short = c.minimumInr !== null && !kept;
  const ideal = c.idealInr !== null && !kept && !short;
  const ask = short ? (c.minimumInr as number) : ideal ? (c.idealInr as number) : null;

  return (
    <section className="beauty-sheet" style={{ margin: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, margin: 0, textTransform: 'uppercase', letterSpacing: '.12em' }}>{meta.label}</h3>
        <span className="muted" style={{ fontSize: 11 }}>{c.picks.length} product{c.picks.length === 1 ? '' : 's'}</span>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{roleStrip(c)}</div>

      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '7px 12px', margin: '14px 0 0' }}>
        <dt className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Budget</dt>
        <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, textAlign: 'right' }}>{rupees(c.budgetInr)}</dd>
        <dt className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Routine cost</dt>
        <dd style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.01em', textAlign: 'right', lineHeight: 1.1 }}>
          {rupees(c.spendInr)}<span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}> to buy</span>
        </dd>
      </dl>

      {/* THE ONE STATE THIS BAR EXISTS TO SHOW WAS THE ONE IT COULD NOT.
          Capping the fill at 100 is right — a bar that runs past its own track
          is a bar that has stopped meaning anything — but the cap was the whole
          drawing, so 101% and 100% rendered as the same solid accent and the
          overrun lived only in the sentence beside it. The track now carries the
          last stretch in the warning ink, sized to the overrun and never less
          than a visible sliver, so the figure and the picture agree. */}
      <div aria-hidden style={{ height: 6, borderRadius: 'var(--r-full)', background: 'var(--line)', overflow: 'hidden', margin: '12px 0 7px', display: 'flex' }}>
        <div style={{ width: `${Math.min(100, pct) - (c.overInr > 0 ? Math.max(3, Math.min(12, pct - 100)) : 0)}%`, height: '100%', background: 'var(--accent)' }} />
        {c.overInr > 0 && (
          <div style={{ width: `${Math.max(3, Math.min(12, pct - 100))}%`, height: '100%', background: 'var(--warn-ink)' }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{pct}% of your {meta.label.toLowerCase()} budget</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700 }}>
          {c.overInr > 0 ? `${rupees(c.overInr)} above budget` : `${rupees(c.remainingInr)} remaining`}
        </span>
      </div>
      {/* THE ONLY TIME THIS ROUTINE COSTS MORE THAN THE NUMBER SOMEBODY SET, and
          it is said out loud rather than absorbed. The five per cent of headroom
          is the top half of the 95–105% band: shelf prices can't always land
          exactly on the number, so the planner may finish up to 5% over — and
          never a rupee further. The sentence used to justify the overrun with
          "a better match", which the band pass can no longer promise. */}
      {c.overInr > 0 && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '7px 0 0' }}>
          {rupees(c.overInr)} over the {rupees(c.budgetInr)} you set — shelf prices can&rsquo;t always
          land exactly on your number — we allow up to five per cent over, never more.
        </p>
      )}

      {/* WHAT IS NOT HERE, AND WHY — before the ask, not after it. These are
          the sentences that turn a short list into a reasoned one: "you don't
          need a separate toner" and "a treatment step would fit your profile
          but not this budget" are different facts and a lean routine has to say
          which one it means. */}
      {/* WHAT THEY ALREADY HAVE, ABOVE WHAT WE LEFT OUT, because they are
          different sentences and the citizen's own answer comes first. A step
          they told us about is not a step we declined — and until this shipped
          it was neither: it was a step we sold them twice. */}
      {c.kept.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {c.kept.map((k) => (
            <li key={k.role} style={{ fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700 }}>{k.role}</span>
              <span className="muted"> — {k.why}</span>
            </li>
          ))}
        </ul>
      )}

      {c.leftOut.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {c.leftOut.slice(0, 3).map((l) => (
            <li key={l.role} className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>· {l.why}</li>
          ))}
        </ul>
      )}

      {/* ── A CONCERN WE PRINTED AS A CHIP AND THEN DID NOT ANSWER ────────────
          The page prints the citizen's declared findings at the top and a
          routine underneath, and nothing checked that the second addressed the
          first. Live, nothing in a ₹51,549 routine treated the blackheads: not
          a selection bug — no product answering that key survived this
          category's roles — but a promise broken without a word. Said plainly
          here, where the rest of what this category did and did not do is. */}
      {/* `?? []` BECAUSE THE TWO RAILS DEPLOY SEPARATELY. The field arrives
          with the Railway release; between that and the Vercel one this page is
          reading a plan that does not have it, and `.length` on undefined is a
          white screen rather than a missing sentence. */}
      {(c.uncoveredNeeds ?? []).length > 0 && (
        <p style={{ fontSize: 12, lineHeight: 1.55, margin: '12px 0 0' }}>
          <strong>Not treated here</strong>
          <span className="muted"> — {(c.uncoveredNeeds ?? []).map(needLabel).join(', ')}. Nothing on this
            shelf that answers {(c.uncoveredNeeds ?? []).length === 1 ? 'it' : 'them'} fits a step in your
            {' '}{meta.label.toLowerCase()} routine.</span>
        </p>
      )}

      {/* ── WHAT IT COSTS TO KEEP, AND WHERE THAT MONEY GOES ─────────────────
          One line, and it only appears when one bottle is more than half of
          the category's upkeep — which on the live sheet was true twice, at
          73% and 79%. The budget is a purchase budget by design; this is the
          number it does not govern, put where somebody can act on it. */}
      {dominant && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '10px 0 0' }}>
          ≈ {rupees(c.monthlyInr)}/month to keep going — {rupees(dominant.monthlyInr)} of that
          is one product, the {dominant.name}.
        </p>
      )}

      {/* ── MONEY THIS SHELF CANNOT HONESTLY SPEND ───────────────────────────
          `usefulMaxInr` is the dearest routine in which every step is at least
          as well matched as the best cheap one. It has been computed per person
          since the cap landed and it caps the dial on the profile — but the
          routine page never showed it, so a citizen whose budget runs past it
          sees 99% of a number used and no hint that the last stretch bought a
          dearer version of the same answer. */}
      {c.usefulMaxInr > 0 && c.spendInr > c.usefulMaxInr && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '10px 0 0' }}>
          Past about {rupees(c.usefulMaxInr)}, extra money buys a dearer version of the same
          answer — not a closer match.
        </p>
      )}

      {/* TWO ASKS, NEVER BOTH, AND NEITHER EVER ACTS ON ITS OWN.
          · SHORT — the budget will not carry the essentials, and the figure that
            would is offered.
          · IDEAL — the budget carries a routine, but the best compatible one
            costs more than the five per cent headroom permits. Crossing that is
            the citizen's decision and they make it by moving the number.
          Both doors are spelled out with the amount on them. "Keep ₹1,000" is a
          real answer and it is the one that costs nothing. */}
      {ask !== null && (
        <div style={{ marginTop: 14, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 'var(--r-1)', padding: '11px 13px' }}>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            {short ? (
              <>
                {rupees(c.budgetInr)} won&rsquo;t carry the full base for your {meta.label.toLowerCase()} —
                the essentials come to about <strong>{rupees(ask)} to buy</strong> together. We&rsquo;ve built
                what fits, essentials first. Nothing has been changed on your behalf.
              </>
            ) : (
              <>
                The best routine we can build for your {meta.label.toLowerCase()} comes
                to <strong>{rupees(ask)} to buy</strong>, above the {rupees(c.budgetInr)} you set. This is
                the best one that fits — we won&rsquo;t go over your budget without asking.
              </>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button variant="accent" size="sm" disabled={raising} onClick={() => onRaise(ask)}>
              {raising ? 'Saving…' : `Set ${rupees(ask)}`}
            </Button>
            <Button variant="line" size="sm" onClick={onKeep}>Keep {rupees(c.budgetInr)}</Button>
          </div>
        </div>
      )}

      {/* WHY IT STOPPED SHORT OF THE BUDGET — the server's sentence, not one
          written here. It is the plan explaining its own arithmetic: every
          compatible step is already in, every step already holds the best
          product for it, and the rest of the money buys nothing worth having. */}
      {/* WHAT IT COSTS TO KEEP, under what it costs to buy. The budget is set in
          purchase prices — owner's call, 15 Aug — and this is the number that
          still says a big jar is better value than a small one. */}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
        ≈ {rupees(c.monthlyInr)}/month to keep going
      </div>

      {/* A BUDGET EVEN THE BAND PASS CANNOT SPEND. Under the band-first rule
          (owner, 16 Aug) the planner spends to 95–105% wherever the guarded
          shelf allows, so this paragraph — which used to be the normal state
          of a big budget — now appears only when the shelf genuinely cannot
          absorb the band: usefulMaxInr, the plan at the dial's own maximum,
          sits below this budget's floor. leanReason says why in the planner's
          own words; this line gives the number a reader can argue with. */}
      {!short && c.usefulMaxInr > 0 && c.usefulMaxInr < c.targetLowInr && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' }}>
          This shelf tops out at about {rupees(c.usefulMaxInr)} for your profile; you&rsquo;ve
          set {rupees(c.budgetInr)}.
        </p>
      )}

      {!short && c.leanReason && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '12px 0 0' }}>{c.leanReason}</p>
      )}

      {/* Offered, never taken. Two kinds: a step the routine does not have, and
          a dearer version of one it does. The second used to be swapped in
          silently whenever the routine sat under 90% of the budget, on the
          strength of a price grade and nothing else — see budget-routine.ts
          pass 5b. It carries the sentence that made it an offer, and the
          sentence is why it is down here rather than in the routine. */}
      {!short && c.upgrades.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Optional, if you want it</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.upgrades.slice(0, 3).map((u) => (
              <li key={u.productId} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700 }}>{u.role}</span>
                <span className="muted"> — {u.name} · {rupees(u.priceInr)}</span>
                {u.reason && <div className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>{u.reason}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The four assurances along the foot, from the owner's reference. */
const ASSURANCES: Array<[string, string]> = [
  ['◇', 'Matched to your own assessment'],
  ['❍', 'Nothing you have told us you react to'],
  ['✓', 'Ingredients named on every step'],
  ['⬡', 'An order you can actually follow'],
];

export function Routine() {
  const routine = useBeautyRoutine();
  const saveBudget = useSaveBeautyBudget();
  /**
   * THE BAG IS NOT THIS PAGE'S. It was a `useState` here and another one on the
   * market, which meant two bags with two totals and two checkout buttons — and
   * both were erased by following a link. It lives on the server now and every
   * surface reads the same one.
   */
  const bagged = useBagActions();
  // "Keep ₹1,000" is an answer, and it is remembered for the visit rather than
  // saved: nothing about the budget changes, the question simply stops being
  // asked. Saving a dismissal would be storing an opinion about a number the
  // citizen has already given us.
  const [kept, setKept] = useState<Record<string, boolean>>({});
  /**
   * WHAT THE BAG WAS BEFORE "Add the whole routine", and the signature of what
   * that press wrote. Undo is offered only while the two still agree — one tap
   * on any step's + or –, or a second surface touching the same bag, and this
   * snapshot is of a bag that no longer exists, so the page stops offering to
   * restore it rather than quietly throwing away work that came after.
   */
  const [addedAll, setAddedAll] = useState<{ prev: { id: string; qty: number }[]; key: string } | null>(null);
  // THE SEASONAL LINE CAME WITH THE ROUTINE THAT LEFT THE PROFILE PAGE.
  // "Summer: lightweight gel moisturiser, blot excess oil, reapply SPF" is
  // routine advice, so it belongs on the routine — but the product engine is
  // pure and has no clock or climate in it, and it is the assessment that
  // works this out. Rather than plumb it through the server for one sentence,
  // the page that shows routines reads the assessment it is already built
  // from. Deleting the sentence with the card it sat in would have been the
  // quiet cost of tidying up.
  const seasonal = useBeautyProfile().data?.analysis?.routine?.seasonal;

  const data = routine.data;

  /**
   * ONE BOTTLE PER PRODUCT, NOT ONE PER STEP.
   *
   * A cleanser is in the morning band and the evening band, and it is one
   * bottle. Keying the bag by productId across every band is what makes "add
   * the whole routine" charge for what you would actually buy — a bag built
   * per step would have sold this person two of everything they use twice a
   * day and looked entirely reasonable doing it.
   */
  const everyStep = useMemo(() => {
    const byId = new Map<string, ProductRoutineStep>();
    // A STEP WITH NO PRODUCT ID MUST NEVER REACH HERE: it would key the map on
    // '', join to no pick, price at ₹0, and be handed to "add the whole
    // routine" as something to buy. That used to be the same test as `!s.owned`
    // and stopped being so on 22 Aug — an owned step now carries a real product
    // and belongs in the bag like any other. The id is what the rule was always
    // about; the flag was standing in for it.
    for (const r of data?.routines ?? []) for (const s of r.steps) if (s.productId && !byId.has(s.productId)) byId.set(s.productId, s);

    return [...byId.values()];
  }, [data]);

  /**
   * WHERE EACH PRODUCT IS FIRST OFFERED, so the second time it appears the page
   * points back instead of offering to buy it again. Built in band order — the
   * order the page renders — because "first" has to mean first on screen, not
   * first in whatever order the API returned its routines.
   */
  const firstSeen = useMemo(() => {
    const at = new Map<string, string>();
    for (const r of data?.routines ?? []) for (const s of r.steps) if (s.productId && !at.has(s.productId)) at.set(s.productId, r.title);
    return at;
  }, [data]);

  /**
   * The plan, joined to the steps by productId.
   *
   * This is the ONLY link between what the budget decided and what the sheet
   * shows, which is why the wire shape is asserted on the server: a join on a
   * field that isn't there produces a page with no monthly costs on it and no
   * error anywhere.
   */
  const picks = useMemo(() => {
    const m = new Map<string, RoutinePick>();
    for (const k of ['face', 'hair', 'body'] as const) {
      for (const p of data?.plan?.[k].picks ?? []) m.set(p.productId, p);
    }
    return m;
  }, [data]);

  // What the whole routine costs to buy today, and what it costs to keep. Both
  // are the routine's own figures and neither depends on the bag.
  const routineTotal = everyStep.reduce((n, s) => n + s.priceInr, 0);
  const monthlyTotal = data?.plan?.totalMonthlyInr ?? 0;
  /** What the routine costs to BUY — the unit the budget is set in. The bar
   *  above compared `monthlyTotal` against it, which is two different things
   *  in one sentence: "₹3,535 of ₹21,000" read as 17% used when the routine
   *  had in fact spent ₹7,165 of it. */
  const spendTotal = data?.plan?.totalSpendInr ?? 0;

  if (routine.isLoading) return <Spinner label="Building your routine…" />;

  // `empty` is `!data || …`, so a failed read produced "No routine yet — tell us
  // about your skin and hair", sending a citizen who has already filled in that
  // profile back to fill it in again. The routine is built from what they told
  // us; failing to read it is not the same as never having been told.
  if (routine.isError) {
    return (
      <div>
        <div className="eyebrow">Beauty Hub · Routine</div>
        <h1 style={{ fontSize: 26 }}>Your routine</h1>
        <EmptyState
          icon="⚠️"
          title="We couldn’t build your routine just now"
          hint="Your skin and hair profile is safe — this didn’t reach us. There’s nothing to fill in again; try once more in a moment."
        />
      </div>
    );
  }

  /**
   * NO BUDGET, NO ROUTINE — and this is a gate rather than an empty state.
   *
   * The server returns `needsBudget` instead of a routine costed against a
   * number nobody chose. Defaulting one silently is the single thing the design
   * refuses: a routine you did not set a budget for is a routine that was
   * priced FOR you, which is the shop behaviour this whole feature replaces.
   */
  if (data?.needsBudget) {
    return (
      <div>
        <div className="eyebrow">Beauty Hub · Routine</div>
        <h1 style={{ fontSize: 26 }}>Your routine</h1>
        <div className="card" style={{ maxWidth: 560, borderLeft: '4px solid var(--accent)' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Set your beauty budget first</h2>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 14px' }}>
            Face, hair and body each get their own limit, and nothing is chosen that goes
            over it. Set it on your Skin &amp; Hair Profile.
          </p>
          <Link to="/beauty/profile"><Button variant="accent">Set my budget</Button></Link>
        </div>
      </div>
    );
  }

  const empty = !data || data.routines.every((r) => r.steps.length === 0);

  /**
   * A CATEGORY SET TO ZERO IS NOT SHOWN AT ALL.
   *
   * Not an empty band, not "nothing here yet", not a nudge to raise it —
   * somebody who set Body to nothing has said they are not spending there, and
   * the correct response is that the section does not exist. The server already
   * plans nothing for it; this is the page agreeing rather than drawing a
   * heading over the silence.
   */
  const skipped = new Set(
    (['face', 'hair', 'body'] as const).filter((k) => data?.plan?.[k].skipped),
  );
  /** The categories that have a budget. A skipped one gets no card, exactly as
   *  it gets no band — a zero drawn as "₹0 of ₹0" is the nagging this refuses. */
  const plans = (['face', 'hair', 'body'] as const)
    .map((k) => data?.plan?.[k]).filter((c): c is CategoryPlan => Boolean(c) && !c!.skipped);
  const bandCategory: Record<ProductRoutine['timeOfDay'], 'face' | 'hair' | 'body' | null> = {
    // Morning, evening and weekly can hold face AND hair steps, so they are
    // only dropped when nothing survived the plan; body is one category and one
    // band, and is dropped outright.
    morning: null, evening: null, weekly: null, body: 'body',
  };
  const band = (k: ProductRoutine['timeOfDay']) => {
    const cat = bandCategory[k];
    if (cat && skipped.has(cat)) return undefined;
    return data?.routines.find((r) => r.timeOfDay === k);
  };
  const day = [band('morning'), band('evening')].filter(Boolean) as ProductRoutine[];
  const rest = [band('weekly'), band('body')].filter(Boolean) as ProductRoutine[];

  /**
   * ── ADD THE WHOLE ROUTINE ───────────────────────────────────────────────
   *
   * This button was here, was removed at the owner's word — "adding ten
   * products in one tap is the one bag action nobody can undo in one tap" —
   * and is back at the owner's word. The objection was right, so it comes
   * back answered rather than merely overruled: the press is reversible in
   * one press, for as long as the bag is still what the press made it.
   *
   * IT ADDS WHAT IS MISSING, NOT WHAT IS LISTED. Anything already in the bag
   * keeps the quantity it has — pressing this twice does not buy two of
   * everything — and `everyStep` is keyed by productId, so a cleanser used
   * morning and evening is one bottle rather than two.
   *
   * ONE CONTROL, RENDERED TWICE. The same element sits in the summary card
   * that prices the routine and again at the foot, after the last step: on a
   * phone the summary is a long scroll above the decision, and a button you
   * have to scroll back up to is a button on a desk. Written once so the two
   * cannot drift into saying different things.
   */
  const missing = everyStep.filter((s) => bagged.qtyOf(s.productId) === 0);
  const missingTotal = missing.reduce((n, s) => n + s.priceInr, 0);
  const canUndo = Boolean(addedAll) && addedAll!.key === bagKey((bagged.bag?.lines ?? []).map((l) => ({ id: l.id, qty: l.qty })));
  const addWhole = empty ? null : canUndo ? (
    <div className="routine-addall">
      <span style={{ fontSize: 12, fontWeight: 700 }}>Added to your bag</span>
      <Button variant="line" size="sm" disabled={bagged.isSaving}
        onClick={() => { bagged.restore(addedAll!.prev); setAddedAll(null); }}>Undo</Button>
    </div>
  ) : missing.length === 0 ? (
    <div className="routine-addall">
      <span className="muted" style={{ fontSize: 11.5 }}>Every step is in your bag.</span>
    </div>
  ) : (
    <div className="routine-addall">
      {/* THE PRICE IS BESIDE THE BUTTON, NOT INSIDE IT. In the summary card the
          button has about 270px on a phone, and a label carrying a count and a
          rupee figure wrapped to two lines inside a control whose height is
          fixed at 35px in the stylesheet — the text left the pill. It is also
          the more honest arrangement: the button says what it does, the line
          beside it says what it costs. */}
      <Button variant="accent" size="sm" disabled={bagged.isSaving}
        onClick={() => setAddedAll(bagged.addAll(missing.map((s) => s.productId)))}>
        {missing.length === everyStep.length ? 'Add the whole routine' : `Add the remaining ${missing.length}`}
      </Button>
      {/* Only when it is PART of the routine. "9 products · ₹3,535" beside a
          button in a card that has just printed ₹3,535 and "9 products" is the
          same fact three times; what is not already on the page anywhere is
          what the ones still missing come to. */}
      {missing.length !== everyStep.length && (
        <span className="muted" style={{ fontSize: 11.5 }}>{rupees(missingTotal)} to add</span>
      )}
    </div>
  );

  return (
    <div>
      <div className="eyebrow">Beauty Hub · Routine</div>

      {/* ── the masthead ───────────────────────────────────────────────────
          The reference's one indispensable idea: this is not a settings screen
          with a list on it, it is a sheet with a title. `beauty-display` is
          the display serif, granted by name in relief.spec — the third and
          last thing in the city allowed to borrow the press's face. */}
      <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)', marginBottom: 16, padding: '22px 22px 20px' }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 210 }}>
            <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase' }}>Your daily</div>
            <h1 className="beauty-display" style={{ fontSize: 'clamp(34px, 4.6vw, 50px)', lineHeight: 1.02, margin: '4px 0 2px', color: 'var(--accent-ink)' }}>
              AM &amp; PM
            </h1>
            <div className="beauty-display" style={{ fontSize: 'clamp(19px, 2.2vw, 25px)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
              skin &amp; hair routine
            </div>
          </div>

          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', flex: 1, minWidth: 200 }}>
            {(['morning', 'evening'] as const).map((k) => (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span aria-hidden style={{ fontSize: 20, color: 'var(--accent-ink)' }}>{BAND[k].icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{k === 'morning' ? 'Morning' : 'Night'} routine</div>
                  <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{BAND[k].sub}</div>
                </div>
              </div>
            ))}
          </div>

          {!empty && (
            <div style={{ minWidth: 190, background: 'var(--card)', border: '1px solid var(--accent-line)', borderRadius: 12, padding: '13px 15px' }}>
              <div className="muted" style={{ fontSize: 11 }}>The whole routine</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.01em' }}>{rupees(routineTotal)}</div>
              {/* Both numbers, because they answer two different questions: what
                  it costs to buy today, and what it costs to keep. */}
              {/* ── THE NUMBER THE BUDGET DOES NOT GOVERN ────────────────────
                  A budget is what you hand over at the counter — the owner
                  settled that on 15 Aug and nothing here reopens it. But the
                  upkeep figure sat in 11px grey under the price and was left to
                  the reader to annualise, and on this profile it annualises to
                  nearly six times the budget. The routine is not too expensive;
                  the page was simply quieter about the larger of its two
                  numbers than about the smaller. */}
              {monthlyTotal > 0 && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>≈ {rupees(monthlyTotal)}/month to keep going</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>about {rupees(monthlyTotal * 12)} over a year, at the doses this routine assumes</div>
                </div>
              )}
              {/* "ADD ALL TO BAG" IS BACK, at the owner's word, and what it
                  cost to remove is worth keeping written down: this card is a
                  READING of the routine — what it costs to buy, what it costs
                  to keep, how many bottles that is — and an accent button in it
                  turns a reading into a till. The reason it can stand here now
                  is the undo beside it; see `addWhole` above. Every step still
                  carries its own Add to bag, and this one adds only what those
                  have not already. */}
              <div className="muted" style={{ fontSize: 11 }}>{everyStep.length} products</div>
              {data?.reorder && <NextOrder due={data.reorder} />}
              {addWhole}
            </div>
          )}
        </div>

        {/* WHAT THIS WAS BUILT FROM, named. Three inputs and the budget is one
            of them — a routine that quietly cost what it cost would make the
            budget a filter applied afterwards, which is the thing it isn't. */}
        <p className="muted" style={{ fontSize: 12, margin: '16px 0 0', lineHeight: 1.55 }}>
          Built from your profile, your goals
          {data?.budget && data.plan ? `, and your ${rupees(data.plan.totalBudgetInr)} budget` : ''}.
          Anything you react to is left out.
        </p>
      </div>

      {data && !empty && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {data.personalisedBy.assessment && <span className="tag" style={{ fontSize: 11 }}>from your assessment</span>}
          {/* WHAT THE FLAG ACTUALLY MEANS. `labs` is a boolean: the assessment
              read the citizen's blood work. It does not carry WHICH marker, or
              what it changed, and "using your biomarkers" over a routine is a
              claim of influence nobody can check — the one kind of
              personalisation badge that is worse than none. It says what it can
              support and goes to the page where the reasoning is written. */}
          {data.personalisedBy.labs && (
            <Link to="/beauty/profile" className="tag" style={{ fontSize: 11 }}>
              🩸 your biomarkers were read — see your assessment
            </Link>
          )}
          {data.personalisedBy.concerns.map((c) => <span key={c} className="tag" style={{ fontSize: 11 }}>{c}</span>)}
        </div>
      )}

      {/* ── IT IS NOT A FORECAST, SO IT NO LONGER DRESSES AS ONE ─────────────
          The sentence is one static string per skin type, written by the
          assessment, and it names BOTH seasons in the same breath: "Summer: …
          Winter: …". Printed under a weather emoji, above a routine built this
          morning, it read as advice for today — and there is no clock and no
          city anywhere in the engine that produced it. The heading says what it
          actually is: the standing note about how this routine moves through
          the year. Give the engine a date and a place and this can become a
          forecast; until then it must not look like one. */}
      {!empty && seasonal && (
        <div style={{ margin: '0 0 14px', background: 'var(--paper)', borderRadius: 'var(--r-1)', padding: '10px 12px' }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            How this routine changes with the seasons
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: '4px 0 0' }}>{seasonal}</p>
        </div>
      )}

      {empty ? (
        <>
          <EmptyState
            icon="🧴"
            title="No routine yet"
            hint="Tell us about your skin and hair — or run a photo assessment — and your routine builds itself."
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <Link to="/beauty/profile"><Button variant="accent">Complete your profile</Button></Link>
            <Link to="/beauty/market"><Button variant="line">Browse products</Button></Link>
          </div>
        </>
      ) : (
        <>
          {/* ── the money, before the products ───────────────────────────────
              ABOVE THE ROUTINE, not beneath it. The budget is the input the
              whole sheet was built from, and a citizen who scrolls four
              products deep before learning what they were selected against has
              been shown a shop with a receipt at the bottom.

              PER CATEGORY, because that is how the budget was set and how it is
              spent — face money never buys a shampoo. The bands below are per
              time of day, which is how a routine is USED; these two groupings
              are different on purpose and the page shows both rather than
              collapsing one into the other. */}
          {plans.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '2px 0 9px' }}>
                <h2 style={{ fontSize: 13, margin: 0, textTransform: 'uppercase', letterSpacing: '.12em' }}>Your budget</h2>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {rupees(spendTotal)} of {rupees(data.plan?.totalBudgetInr ?? 0)} · ≈ {rupees(monthlyTotal)}/month to keep
                </span>
                {/* THE ONE PLACE A BUDGET IS SET IS THE PROFILE, so this is a
                    way back to it and not a second set of dials. */}
                <Link to="/beauty/profile" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700 }}>Adjust budget</Link>
              </div>
              <div className="routine-budget" style={{ marginBottom: 16 }}>
                {plans.map((c) => (
                  <BudgetCard key={c.category} c={c}
                    kept={kept[c.category] ?? false}
                    onKeep={() => setKept((k) => ({ ...k, [c.category]: true }))}
                    raising={saveBudget.isPending}
                    onRaise={(n) => {
                      const b = data.budget;
                      if (b) saveBudget.mutate({ face: b.face, hair: b.hair, body: b.body, [c.category]: n });
                    }} />
                ))}
              </div>
            </>
          )}

          {/* AM and PM abreast, as in the reference; the divider between them is
              the only rule on the page and it is what makes them read as two
              halves of one day rather than two lists. */}
          <div className="beauty-sheet is-shop routine-day">
            {day.map((r) => <Band key={r.timeOfDay} r={r} picks={picks} bagged={bagged} seen={firstSeen} />)}
          </div>

          {rest.filter((r) => r.steps.length > 0).map((r) => (
            <div key={r.timeOfDay} className="beauty-sheet is-shop">
              <Band r={r} picks={picks} bagged={bagged} seen={firstSeen} />
            </div>
          ))}

          {addWhole}

          <div className="routine-assure beauty-sheet">
            {ASSURANCES.map(([mark, text]) => (
              <div key={text} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <span aria-hidden style={{ fontSize: 15, color: 'var(--accent-ink)' }}>{mark}</span>
                <span className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', lineHeight: 1.4 }}>{text}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/beauty/market"><Button variant="line" size="sm">Browse the whole market</Button></Link>
            <Link to="/beauty/profile"><Button variant="line" size="sm">Update my profile</Button></Link>
          </div>

          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 18 }}>{data.disclaimer}</p>
        </>
      )}

      <BeautyBagBar />
    </div>
  );
}

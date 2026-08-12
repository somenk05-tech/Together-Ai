import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useBagActions, useBeautyProfile, useBeautyRoutine, useSaveBeautyBudget,
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
 * and the serum will still be there at Christmas. Against a MONTHLY budget the
 * only honest figure is the monthly one, which is what the plan is built on and
 * what this page now shows beside every price.
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
 * retailer's CDN and walks primary → alternate → category mark. Two copies of
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
function Step({ s, pick, qty, alreadyIn, onAdd, onRemove }: { s: ProductRoutineStep; pick?: RoutinePick; qty: number; alreadyIn?: string; onAdd: () => void; onRemove: () => void }) {
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
        <ProductShot image={s.image} imageAlt={s.imageAlt} category={s.category} fill />
      </div>

      <div className="routine-body">
        <div className="routine-top">
          <span className="muted" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>{s.step}</span>
          {/* WHY THIS STEP IS HERE, in one word. The plan sorts everything into
              three tiers and acts on them — essentials go in first and are never
              dropped for a nicer optional — so saying which is which is telling
              somebody how their own routine was reasoned, not decorating it. */}
          {pick && (
            <span className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.09em',
              borderRadius: 999, padding: '2px 7px',
              background: pick.tier === 'high-value' ? 'var(--accent-soft)' : 'transparent',
              color: pick.tier === 'high-value' ? 'var(--accent-ink)' : undefined,
              border: pick.tier === 'high-value' ? '1px solid var(--accent-line)' : '1px solid var(--line)' }}>
              {TIER_LABEL[pick.tier]}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="routine-price">₹{s.priceInr}</span>
          {pick && <span className="muted" style={{ fontSize: 11 }}>≈ {rupees(pick.monthlyInr)}/month</span>}
        </div>
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
        {/* The working behind the monthly figure. Without it "≈ ₹366/month" is
            an assertion; with it, it is arithmetic anybody can check. */}
        {pick && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {pick.packLabel ? `One ${pick.packLabel} pack — ${pick.lastsLabel}` : `Lasts ${pick.lastsLabel}`}
          </div>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.55 }}>{s.instructions}</p>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{s.frequency}</div>

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
    <section style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, paddingBottom: 4 }}>
        <span aria-hidden style={{ fontSize: 15, color: 'var(--accent-ink)' }}>{meta.icon}</span>
        <h2 style={{ fontSize: 15, margin: 0, textTransform: 'uppercase', letterSpacing: '.09em' }}>{r.title}</h2>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
          {r.steps.length === 0 ? 'nothing yet' : `${r.steps.length} step${r.steps.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>{meta.sub}</div>

      {r.notes.map((n) => (
        <p key={n} style={{ fontSize: 12.5, lineHeight: 1.55, margin: '8px 0 0', background: 'var(--paper)', borderRadius: 10, padding: '9px 12px' }}>{n}</p>
      ))}

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
const CATEGORY: Record<CategoryPlan['category'], { label: string; sub: string }> = {
  face: { label: 'Face', sub: 'Cleanse · treat · moisturise · protect' },
  hair: { label: 'Hair', sub: 'Wash · condition · scalp' },
  body: { label: 'Body', sub: 'Wash · moisturise · hands & lips' },
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
  const pct = c.budgetInr > 0 ? Math.round((c.monthlyInr / c.budgetInr) * 100) : 0;
  const short = c.minimumInr !== null && !kept;
  const ideal = c.idealInr !== null && !kept && !short;
  const ask = short ? (c.minimumInr as number) : ideal ? (c.idealInr as number) : null;

  return (
    <section className="beauty-sheet" style={{ margin: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, margin: 0, textTransform: 'uppercase', letterSpacing: '.12em' }}>{meta.label}</h3>
        <span className="muted" style={{ fontSize: 11 }}>{c.picks.length} product{c.picks.length === 1 ? '' : 's'}</span>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{meta.sub}</div>

      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '7px 12px', margin: '14px 0 0' }}>
        <dt className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Monthly budget</dt>
        <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, textAlign: 'right' }}>{rupees(c.budgetInr)}</dd>
        <dt className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Routine cost</dt>
        <dd style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-.01em', textAlign: 'right', lineHeight: 1.1 }}>
          {rupees(c.monthlyInr)}<span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>/month</span>
        </dd>
      </dl>

      <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', margin: '12px 0 7px' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{pct}% of your {meta.label.toLowerCase()} budget</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700 }}>
          {c.overInr > 0 ? `${rupees(c.overInr)} above budget` : `${rupees(c.remainingInr)} remaining`}
        </span>
      </div>
      {/* THE ONLY TIME THIS ROUTINE COSTS MORE THAN THE NUMBER SOMEBODY SET, and
          it is said out loud rather than absorbed. The planner may go up to five
          per cent over when that buys a meaningfully better-matched product, and
          never a rupee further — so the sentence explains the overrun instead of
          apologising for it. */}
      {c.overInr > 0 && (
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '7px 0 0' }}>
          {rupees(c.overInr)} over the {rupees(c.budgetInr)} you set — we allow up to five per cent
          when it buys a better match for your {meta.label.toLowerCase()}, and never more than that.
        </p>
      )}

      {/* WHAT IS NOT HERE, AND WHY — before the ask, not after it. These are
          the sentences that turn a short list into a reasoned one: "you don't
          need a separate toner" and "a treatment step would fit your profile
          but not this budget" are different facts and a lean routine has to say
          which one it means. */}
      {c.leftOut.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {c.leftOut.slice(0, 3).map((l) => (
            <li key={l.role} className="muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>· {l.why}</li>
          ))}
        </ul>
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
        <div style={{ marginTop: 14, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 10, padding: '11px 13px' }}>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            {short ? (
              <>
                {rupees(c.budgetInr)} a month won&rsquo;t carry the full base for your {meta.label.toLowerCase()} —
                the essentials come to about <strong>{rupees(ask)}/month</strong> together. We&rsquo;ve built
                what fits and put the most important steps in first. Nothing has been changed on your behalf.
              </>
            ) : (
              <>
                The best routine we can build for your {meta.label.toLowerCase()} comes
                to <strong>{rupees(ask)}/month</strong>, above the {rupees(c.budgetInr)} you set. We&rsquo;ve
                built the best one that fits instead — we won&rsquo;t go over your budget without asking.
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
      {!short && c.leanReason && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '12px 0 0' }}>{c.leanReason}</p>
      )}

      {/* Offered, never taken. These are the products that would go in if the
          budget grew — named, priced by the month, and left alone. */}
      {!short && c.upgrades.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Optional, if you want it</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.upgrades.slice(0, 2).map((u) => (
              <li key={u.productId} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700 }}>{u.role}</span>
                <span className="muted"> — {u.name} · ≈ {rupees(u.monthlyInr)}/month</span>
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
    for (const r of data?.routines ?? []) for (const s of r.steps) if (!byId.has(s.productId)) byId.set(s.productId, s);

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
    for (const r of data?.routines ?? []) for (const s of r.steps) if (!at.has(s.productId)) at.set(s.productId, r.title);
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
          <h2 style={{ fontSize: 16, margin: 0 }}>Set your monthly beauty budget first</h2>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 14px' }}>
            We&rsquo;ll use your profile and your budget to build your routine — face, hair and
            body each with their own monthly limit, and nothing chosen that goes over it. The
            budget sits on your Skin &amp; Hair Profile, under the assessment.
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
                <span aria-hidden style={{ fontSize: 21, color: 'var(--accent-ink)' }}>{BAND[k].icon}</span>
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
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.01em' }}>{rupees(routineTotal)}</div>
              {/* Both numbers, because they answer two different questions: what
                  it costs to buy today, and what it costs to keep. */}
              {monthlyTotal > 0 && (
                <div className="muted" style={{ fontSize: 11 }}>≈ {rupees(monthlyTotal)}/month to keep going</div>
              )}
              {/* NO "ADD ALL TO BAG", at the owner's word. This card is a
                  READING of the routine — what it costs to buy, what it costs
                  to keep, how many bottles that is — and the accent button
                  turned it into a till. Adding ten products in one tap is also
                  the one bag action nobody can undo in one tap; every step
                  carries its own Add to bag, which is where a decision that
                  size belongs. `everyStep` stays: it is what the count and the
                  total are made of. */}
              <div className="muted" style={{ fontSize: 11 }}>{everyStep.length} products</div>
              {data?.reorder && <NextOrder due={data.reorder} />}
            </div>
          )}
        </div>

        {/* WHAT THIS WAS BUILT FROM, named. Three inputs and the budget is one
            of them — a routine that quietly cost what it cost would make the
            budget a filter applied afterwards, which is the thing it isn't. */}
        <p className="muted" style={{ fontSize: 12, margin: '16px 0 0', lineHeight: 1.55 }}>
          Built from your saved skin and hair profile, what you told us you want to work on
          {data?.budget && data.plan ? `, and your ${rupees(data.plan.totalBudgetInr)}/month budget` : ''} —
          what to use, in what order, and when. Anything you’ve told us you react to is left out.
        </p>
      </div>

      {data && !empty && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {data.personalisedBy.assessment && <span className="tag" style={{ fontSize: 11 }}>from your assessment</span>}
          {data.personalisedBy.labs && <span className="tag" style={{ fontSize: 11 }}>🩸 using your biomarkers</span>}
          {data.personalisedBy.concerns.map((c) => <span key={c} className="tag" style={{ fontSize: 11 }}>{c}</span>)}
        </div>
      )}

      {!empty && seasonal && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 14px', background: 'var(--paper)', borderRadius: 10, padding: '10px 12px' }}>
          🌦️ {seasonal}
        </p>
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
                  {rupees(monthlyTotal)} of {rupees(data.plan?.totalBudgetInr ?? 0)} a month
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
          <div className="beauty-sheet routine-day">
            {day.map((r) => <Band key={r.timeOfDay} r={r} picks={picks} bagged={bagged} seen={firstSeen} />)}
          </div>

          {rest.filter((r) => r.steps.length > 0).map((r) => (
            <div key={r.timeOfDay} className="beauty-sheet">
              <Band r={r} picks={picks} bagged={bagged} seen={firstSeen} />
            </div>
          ))}

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

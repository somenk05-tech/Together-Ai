import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Spinner } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import { useAstroGemstones, useGemCart } from '../hooks';
import { AstroHeader, AstroTabs, NeedsProfileCard } from '../shared';
import type { GemAtWeight, GemPriority, GemRecommendation, GemRole, GemstonesResponse } from '../api';

/**
 * Tab 05 — Gemstones.
 *
 * THIS IS THE OWNER'S REFERENCE, NOT AN INTERPRETATION OF IT. The first build
 * of this page was an app-native card — photograph on the left, facts in a grey
 * grid on the right — which was a perfectly good product row and threw away the
 * entire composition. The reference makes each stone A PAGE: a capsule at the
 * top, three trait words arched over the photograph, the name beneath in
 * engraved capitals, warm prose under that, and a price ring at the foot,
 * centred the whole way down. Two stones side by side stop being pages and
 * start being products, so they never are.
 *
 * NOT A CATALOGUE. Thirty stones exist and this page opens on at most five,
 * each carrying the ROLE it plays in this particular chart. The order of
 * operations is chart → recommendation → stone, and the shelf is never the
 * first thing anybody sees.
 *
 * ── TWO SURFACES, AS OF 5 SEP ───────────────────────────────────────────────
 *
 * The sheet above was printed once per stone down this page, so a chart with
 * four stones opened on four screens of reference before the reader had chosen
 * anything — and the sheet is written to be read about ONE stone, closely.
 *
 * So the index is now a shelf, in the owner's second reference: a row of tall
 * portrait cards, identical in shape and size, one photograph and one name
 * each. Tapping one opens `AstroGemstone` — the same `StoneSheet`, unchanged,
 * on the stone's own route. The composition below is exactly what it was; what
 * changed is how many of them a reader meets at once.
 *
 * ── WHERE THE COLOUR COMES FROM, BECAUSE IT MATTERS ─────────────────────────
 *
 * Every card in the reference is themed to its own stone — a ruby's title in
 * oxblood, an emerald's in deep green. relief.spec forbids colour written into
 * a page, and rightly: a hex typed here is a decision made outside the system.
 * These are not typed here. They arrive in the catalogue payload beside the
 * photograph and the price, they are the owner's data, and they are applied as
 * custom properties on the card element — the same category of thing as the
 * photograph itself. Nothing in this file names a colour; `gem-is-the-owners`
 * asserts that it never starts to.
 *
 * ── WHAT WAS ADDED TO THE REFERENCE, IN THE REFERENCE'S OWN FORMAT ──────────
 *
 * The reference sheet has two labelled sections — WHEN YOU WEAR IT and WHY IT
 * IS RECOMMENDED. This page is personalised, so it has more to say, and all of
 * it is said the same way: a tracked label and a centred paragraph. WHY THIS
 * STONE, FOR YOU carries the chart's own reasoning; HOW IT IS WORN carries the
 * finger, the hand, the metal and the day; WORN ON TRIAL FIRST appears only on
 * the three stones that need it; WORN IN ITS PLACE names the cheaper stone for
 * the same planet. No new visual vocabulary was invented for any of them.
 *
 * THE ONE DELIBERATE DEVIATION is the badge. The reference puts the stone's
 * catalogue number in a thin circle at the top of the card. Here the stones are
 * ordered by what they do for THIS chart, so a "3" on the first sheet would be
 * answering a question nobody asked. The circle becomes a capsule carrying the
 * role — the same weight, in the same place, saying something true of the
 * reader rather than of the database.
 */

const ROLE_LABEL: Record<GemRole, string> = {
  life: 'Life stone',
  fortune: 'Fortune stone',
  period: 'For this period',
  moon: 'Moon stone',
  number: 'Number stone',
};

const ROLE_NOTE: Record<GemRole, string> = {
  life: 'Worn for a lifetime rather than a season.',
  fortune: 'The second stone of the traditional pair.',
  period: 'For the years you are in now — this one changes.',
  moon: 'Read from where the moon was when you were born.',
  number: 'From numerology rather than the chart.',
};

/**
 * HOW STRONGLY, AND IN WHAT ORDER.
 *
 * Four stones with no order is a page that did the hard part and stopped one
 * step short — the tradition is not neutral between them and neither is this.
 * The rank restores the reference's own numbered badge, and gives it something
 * true to say: it is the order to buy in, not the row in a database.
 */
const PRIORITY_LABEL: Record<GemPriority, string> = {
  'must-have': 'Must have',
  strong: 'Strongly recommended',
  recommended: 'Recommended',
  optional: 'Optional',
};

const PRIORITY_NOTE: Record<GemPriority, string> = {
  'must-have': 'If you wear only one stone, wear this one. It is the stone traditionally considered safe to wear for a whole life.',
  strong: 'Worn alongside the first, never instead of it — the two together are the traditional pair.',
  recommended: 'Worth adding once the stones above it are in place.',
  optional: 'Only if you want it. Nothing about your chart asks for it before the others.',
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** A tracked label. Every section on the sheet is introduced by one of these. */
function Sub({ children }: { children: string }) {
  return <div className="gem-sub">{children}</div>;
}

/**
 * The three trait words, arched over the stone.
 *
 * The geometry is the reference's own — a 130-radius arc across a 360×170 box.
 * `useId` because two sheets on one page would otherwise share a path id and
 * the second one's text would follow the first one's curve, which looks exactly
 * like a rendering bug and is a duplicate-id bug.
 */
function TraitArc({ words }: { words: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 360 170" className="gem-arc" aria-hidden focusable="false">
      <defs><path id={id} d="M 50 160 A 130 130 0 0 1 310 160" fill="none" /></defs>
      {/* Size and tracking live in layout.css, where a media query can reach
          them — the longest trait line in the catalogue is six characters
          longer than the ruby's, and text that overruns its path is clipped
          rather than wrapped. */}
      <text fill="var(--gem-accent)" textAnchor="middle">
        <textPath href={`#${id}`} startOffset="50%">{words}</textPath>
      </text>
    </svg>
  );
}

/** One labelled fact, centred — the reference has no table in it. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gem-body)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}

/**
 * ── THE SHELF, IN THE OWNER'S SECOND REFERENCE ──────────────────────────────
 *
 * A row of tall portrait cards, each one photograph and a name, and nothing
 * else on it — the travel gallery the owner handed over on 5 Sep. Every stone
 * gets the SAME card at the SAME size, which is the whole instruction: a shelf
 * where one thing is bigger than the next is a shelf that has already chosen
 * for you, and the choosing here belongs to the chart and then to the reader.
 *
 * WHAT IT MAY SAY IS FIXED AT THREE THINGS, because the reference says three:
 * the role this stone plays (where the gallery put a section label), the name
 * (its "Greenland"), and the weight prescribed (its date). The price, the
 * finger, the metal, the reasons and the way in are one tap away on the sheet.
 * A card that starts explaining is a card that has stopped being one of a row.
 *
 * The stone's own palette rides in as it does on the sheet — from the
 * catalogue, applied as custom properties, never typed here.
 */
function GemTile({ rec }: { rec: GemRecommendation }) {
  const { gem } = rec;
  return (
    <Link
      to={`/astrology/gemstones/${gem.id}`}
      className="gem-tile"
      style={{
        '--gem-title': gem.theme.title,
        '--gem-body': gem.theme.body,
        '--gem-accent': gem.theme.accent,
      } as React.CSSProperties}
    >
      {/* The buying order, kept from the sheet. It is the one number on the
          card and it is about the reader's chart rather than the database. */}
      <span className="gem-tile-rank">
        {rec.rank}
      </span>

      {/* `no-case` for the same reason the sheet uses it: these are cut-out
          stones, composed not to need a frame around them. */}
      <span className="gem-tile-stone">
        <img className="no-case" src={gem.image} alt={gem.imageAlt} loading="lazy" width={200} height={200} />
      </span>

      <span className="gem-tile-foot">
        <span className="gem-tile-role">{ROLE_LABEL[rec.role]}</span>
        <span className="gem-tile-line">
          <span className="gem-tile-name">{gem.name}</span>
          {/* NO FIGURE WITHOUT A BODY WEIGHT, on the card as on the sheet —
              the carats are worked out from the wearer, and a shelf is not a
              place to start guessing at one. */}
          <span className="gem-tile-meta">
            {rec.weight ? `${rec.weight.carats} ct` : 'Weight needed'}
          </span>
        </span>
      </span>
    </Link>
  );
}

/**
 * ONE STONE, ONE PAGE — AND NOW LITERALLY SO.
 *
 * This sheet was printed four and five times down the index, which made the
 * index four screens of prose before anybody had chosen anything. It is now
 * exported and rendered by `AstroGemstone` on the stone's own route; the index
 * carries the shelf and this carries the answer. Not a line of the composition
 * changed in the move — the capsule, the arc, the engraved name, the price
 * ring and the fold are the owner's reference and stay exactly as they were.
 */
export function StoneSheet({ rec }: { rec: GemRecommendation }) {
  const { gem, wearing } = rec;
  return (
    <Card
      className="gem-sheet"
      style={{
        // The stone's own palette, from the catalogue. Read as variables by the
        // rules above rather than repeated at every element.
        '--gem-title': gem.theme.title,
        '--gem-body': gem.theme.body,
        '--gem-accent': gem.theme.accent,
      } as React.CSSProperties}
    >
      {/* THE REFERENCE'S BADGE, EARNING ITS PLACE. It numbered each card in the
          catalogue, which on a personalised page would be answering a question
          nobody asked. It carries the buying order instead — 1 is the one to
          have if you have one — and the capsule beside it says how strongly. */}
      <div className="gem-rank">
        <span className="gem-num">{rec.rank}</span>
        <span className="gem-cap">
          {PRIORITY_LABEL[rec.priority]} · {ROLE_LABEL[rec.role]}
        </span>
      </div>

      <TraitArc words={gem.traits.join(' · ').toUpperCase()} />

      <div className="gem-photo">
        {/* `no-case` is relief.css's own exemption from the frame every
            photograph gets. These are cut-out stones multiplied onto the sheet;
            an outline and a drop shadow would put a box around a picture
            composed not to need one. */}
        <img className="no-case" src={gem.image} alt={gem.imageAlt} loading="lazy" width={250} height={220} />
      </div>

      <h2 className="gem-display">{gem.name}</h2>
      <p className="gem-body">{gem.description}</p>

      {/* ── the reference, folded ───────────────────────────────────────────
          EIGHT LABELLED SECTIONS TIMES FOUR STONES IS A WALL. Everything from
          here to the weight is reference: true, worth having, and read once.
          Printed open on every visit it buries the three things that are not
          reference — which stone, how much of it, and the way in — under four
          screens of prose somebody has already read.

          So it folds, on the sheet's own vocabulary rather than the city's
          rounded card: a tracked capital line between two hairlines. The
          rounded card is the one thing on this page from another design, which
          is the whole argument of `.gem-sub` above it.

          THE CLOSED LINE CARRIES THE FACTS, not the section count. "How it is
          worn, and why" alone is a section nobody opens; the finger, the metal
          and the day are the answer most people came for, and the stand-in with
          its price is the one thing here that changes a decision. */}
      <Fold face="gem-fold" panel="gem-fold-open"
        title="How it is worn, and why"
        meta={[
          `${wearing.finger}, ${wearing.hand.toLowerCase()}`,
          wearing.metal.toLowerCase(),
          wearing.day,
          rec.substitutes[0]
            ? `${rec.substitutes[0].gem.name.toLowerCase()} in its place`
            : null,
        ].filter(Boolean).join(' · ')}
      >
      {/* ── the personalised section, and the reason this page exists ────────
          The reference is a catalogue sheet and has nothing like it. It goes
          first among the labelled sections because it is the only one written
          about the reader rather than about the stone. */}
      <Sub>Why this stone, for you</Sub>
      {rec.reasons.map((r) => (
        <p key={r} className="gem-body" style={{ marginTop: 8 }}>{r}</p>
      ))}
      <p className="gem-body" style={{ marginTop: 8, fontStyle: 'italic' }}>
        {ROLE_NOTE[rec.role]}
      </p>

      {/* Said plainly, because "which of these do I actually buy" is the
          question somebody leaves this page with otherwise. */}
      <Sub>{`Number ${rec.rank} of the stones for you`}</Sub>
      <p className="gem-body">{PRIORITY_NOTE[rec.priority]}</p>
      {rec.wornWith.length > 0 && (
        <p className="gem-body" style={{ marginTop: 8 }}>
          Traditionally worn together with {rec.wornWith.join(' and ').toLowerCase()}.
        </p>
      )}

      <Sub>How it is worn</Sub>
      <div className="gem-facts">
        <Fact label="Finger" value={wearing.finger} />
        <Fact label="Hand" value={wearing.hand} />
        <Fact label="Metal" value={wearing.metal} />
        <Fact label="First worn" value={wearing.day} />
      </div>

      {/* No "when you wear it" (5 Sep): a sold stone may not promise what the
          wearer's body or mind will do. The tradition speaks in the sections
          above and below; the note stays. */}
      <p className="gem-body" style={{ fontSize: 11.5, marginTop: 8, opacity: .85 }}>
        {gem.wearingNote}
      </p>

      <Sub>Why it is recommended</Sub>
      <p className="gem-body">{gem.whyRecommended}</p>

      {/* Only on the three stones traditionally worn on trial — and they are,
          not coincidentally, three of the dearest things in the catalogue. */}
      {rec.trialNote && (
        <>
          <Sub>Worn on trial first</Sub>
          <p className="gem-body">{rec.trialNote}</p>
        </>
      )}

      {rec.substitutes.length > 0 && (
        <>
          {/* A DIAMOND IS ₹150,000 A CARAT AND A WHITE SAPPHIRE IS ₹6,000. A
              page that answers "which stone" honestly and "what it costs" not
              at all is half an answer. */}
          <Sub>Worn in its place</Sub>
          <div className="gem-facts" style={{ marginTop: 4 }}>
            {rec.substitutes.map((s: GemAtWeight) => (
              <span key={s.gem.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                <img className="no-case" src={s.gem.image} alt="" aria-hidden loading="lazy" width={34} height={34}
                  style={{ width: 34, height: 34, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                <span style={{ fontSize: 12.5, textAlign: 'left' }}>
                  <span style={{ fontWeight: 700 }}>{s.gem.name}</span>
                  {/* THE HEAVIER WEIGHT IS THE POINT. A per-carat price a fifth
                      of the primary's, at nearly twice the carats, is not a
                      fifth of the cost — and finding that out at the counter is
                      what this line exists to prevent. */}
                  {s.weight && s.fromInr !== null
                    ? <span style={{ display: 'block', color: 'var(--gem-body)' }}>{s.weight.carats} ct · from {rupees(s.fromInr)}</span>
                    : <span style={{ display: 'block', color: 'var(--gem-body)' }}>from {rupees(s.gem.perCaratMinInr)}/ct</span>}
                  {/* The cheaper stone gets its own way in. Offering an
                      alternative and then only letting somebody buy the
                      expensive one is not offering an alternative. */}
                  <Link to={`/astrology/gemstones/${s.gem.id}/design`}
                    style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginTop: 2 }}>Add to cart →</Link>
                </span>
              </span>
            ))}
          </div>
          <p className="gem-body" style={{ fontSize: 11.5, marginTop: 10 }}>
            The same planet at a fraction of the price, worn heavier — the tradition asks about
            three-quarters again the weight of the primary stone.
          </p>
        </>
      )}

      </Fold>

      {/* THE WEIGHT, THE PRICE AND THE WAY IN STAY OUT OF THE FOLD. Everything
          above is the reference; this is the decision. A carat figure, what it
          costs at that figure and the button that starts the commission are
          the three things somebody came to the page for, and a fold is a very
          good way to make a way in invisible. */}
      {/* ── how much stone, and therefore what it costs ─────────────────────
          A PRICE PER CARAT IS NOT A PRICE. "₹8,000 – ₹25,000 per carat" tells
          nobody anything until they know how many carats they are prescribed,
          and that is a property of the WEARER rather than of the stone. */}
      <Sub>How much to wear</Sub>
      {rec.weight ? (
        <>
          <div className="gem-weight">
            {rec.weight.carats} <span style={{ fontSize: '.42em', letterSpacing: '.2em' }}>CARATS</span>
          </div>
          {/* THE STONE HAS A SAY IN ITS OWN WEIGHT, and saying which rule bound
              the figure is the difference between a number and a
              recommendation. One rule for all thirty prescribed a hundred-kilo
              citizen nine carats of blue sapphire — the one stone practice is
              most careful about, and the one worn smallest. */}
          <p className="gem-body">
            About {rec.weight.ratti} ratti. {gem.name.toLowerCase().replace(/^./, (c) => c.toUpperCase())} is
            customarily worn between {rec.weight.fromRatti} and {rec.weight.toRatti} ratti
            ({rec.weight.fromCt}–{rec.weight.toCt} ct), and{' '}
            {rec.weight.bound === 'placed'
              ? 'your body weight places you inside that.'
              : rec.weight.bound === 'ceiling'
                ? 'this is the top of it — the general rule of a ratti per ten kilos would go higher, and this stone is not worn that heavy.'
                : 'this is the bottom of it — the general rule would go lower, and the stone is not worn lighter than this.'}
          </p>
          <p className="gem-body" style={{ fontSize: 12, marginTop: 8 }}>
            Your body weight, against the weight this stone is traditionally worn at.
          </p>
          <div>
            <span className="gem-price">
              {rupees(rec.fromInr ?? 0)} – {rupees(rec.toInr ?? 0)} AT THIS WEIGHT
            </span>
          </div>
          <p className="gem-body" style={{ fontSize: 11, marginTop: 10 }}>
            {rupees(gem.perCaratMinInr)} – {rupees(gem.perCaratMaxInr)} per carat. Where you land inside
            that is the quality of the stone, which you choose next.
          </p>
          {/* A GEMSTONE IS A COMMISSION, NOT A BASKET ITEM. Nothing about it is
              decided until somebody has said ring or pendant, which cut, which
              mount and what size — so the button goes to the studio that asks,
              rather than dropping "1 × Blue Sapphire" into a bag nobody could
              make anything from. */}
          <div style={{ marginTop: 16 }}>
            <Link to={`/astrology/gemstones/${gem.id}/design`}>
              <Button variant="accent">Add to cart · design this stone</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          {/* NO BODY WEIGHT, NO FIGURE — the same refusal the ascendant gets
              without a birth time, and for a larger sum of money. */}
          <p className="gem-body">
            The weight is worked out from your body weight, which we don’t have. Add it to your
            profile and the carats and the price appear — we won’t guess at it.
          </p>
          <div>
            <span className="gem-price">
              {rupees(gem.perCaratMinInr)} – {rupees(gem.perCaratMaxInr)} PER CARAT
            </span>
          </div>
        </>
      )}
    </Card>
  );
}


/**
 * ── WHAT CAN I ACTUALLY BUY? ────────────────────────────────────────────────
 *
 * Every sheet above answers "what should I wear" and prices it honestly, which
 * leaves the citizen doing arithmetic across four cards to answer the question
 * they actually have. A blue sapphire at ₹67,500 and an amethyst standing in
 * for it at ₹1,650 are both correct answers to the same chart; which one is
 * YOUR answer depends on a number only you know.
 *
 * SO THE RANK IS THE SPENDING ORDER. The stones are already ranked — 1 is the
 * one to have if you have one — and this walks them in that order, taking the
 * best option each one can afford before moving to the next. It is the beauty
 * hub's budget doctrine in a second place, and deliberately the same shape: the
 * money never buys a lesser stone higher up the list to afford a better one
 * further down.
 *
 * THE PRIMARY WINS WHEN IT FITS. A substitute is a compromise the tradition
 * permits, not a preference — so it is reached for only when the primary does
 * not fit, and then the DEAREST substitute that does, because within the same
 * planet a better stone is a better stone.
 *
 * IT PRICES STONES AND NOTHING ELSE, AND IT SAYS SO. Every figure here is the
 * stone alone, at the weight prescribed and the plainest grade of it. A ring or
 * a pendant adds a weight of gold that can cost more than the stone did — a
 * budget line quietly excluding a ₹56,000 setting would be the worst kind of
 * accurate — so the setting is priced in the studio, where the mount and the
 * size that decide it are chosen.
 *
 * WHICH IS ALSO WHERE "ADD TO CART" GOES FROM HERE. Every one of those buttons
 * in this hub lands in the same place, and nothing is ever locked without
 * somebody having chosen how it is worn.
 *
 * THIS BUDGET IS NOT SAVED, and that is the difference between it and the
 * beauty hub's. That one is a standing monthly limit the engine plans against;
 * this is somebody moving a slider to see what a number buys. Storing it would
 * turn an idle question into a commitment nobody made.
 */
const clampBudget = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

interface Affordable { rec: GemRecommendation; pick: GemAtWeight | null; isSubstitute: boolean; shortBy: number | null }

function planWithin(recs: GemRecommendation[], budgetInr: number): { picks: Affordable[]; totalInr: number } {
  let left = budgetInr;
  const picks: Affordable[] = [];
  for (const rec of recs) {
    const primary: GemAtWeight = { gem: rec.gem, weight: rec.weight, fromInr: rec.fromInr, toInr: rec.toInr };
    const options = [primary, ...rec.substitutes].filter((o) => o.fromInr !== null);
    const affordable = options.filter((o) => (o.fromInr as number) <= left);
    // The primary if it fits; otherwise the dearest substitute that does,
    // because within one planet a better stone is a better stone.
    const chosen = affordable.find((o) => o.gem.id === rec.gem.id)
      ?? [...affordable].sort((a, b) => (b.fromInr as number) - (a.fromInr as number))[0]
      ?? null;
    if (chosen) {
      left -= chosen.fromInr as number;
      picks.push({ rec, pick: chosen, isSubstitute: chosen.gem.id !== rec.gem.id, shortBy: null });
    } else {
      // What the cheapest way into this stone would cost — a gap with a figure
      // on it is a decision; a gap without one is just a blank.
      const cheapest = Math.min(...options.map((o) => o.fromInr as number));
      picks.push({ rec, pick: null, isSubstitute: false, shortBy: Number.isFinite(cheapest) ? cheapest - left : null });
    }
  }
  return { picks, totalInr: budgetInr - left };
}

function BudgetPicker({ data }: { data: GemstonesResponse }) {
  const recs = data.recommendations;
  const cart = useGemCart();
  /** Already locked, so a row can say so rather than offering it twice. */
  const inCart = new Set((cart.data?.lines ?? []).map((l) => l.gemId));
  /** The whole set at its best — the top of the slider, so it always spans
   *  "nothing" to "everything, at the finest quality this shelf sells". */
  const ceiling = useMemo(() => {
    const top = recs.reduce((n, r) => n + (r.toInr ?? 0), 0);
    return Math.max(50_000, Math.ceil(top / 25_000) * 25_000);
  }, [recs]);
  const step = Math.max(500, Math.round(ceiling / 200 / 500) * 500);
  const [budget, setBudget] = useState(() => clampBudget(Math.round(ceiling / 4), ceiling));
  const [typed, setTyped] = useState<string | null>(null);

  const { picks, totalInr } = useMemo(() => planWithin(recs, budget), [recs, budget]);
  const got = picks.filter((p) => p.pick);
  if (recs.length === 0 || data.weightUnknown) return null;

  return (
    <Card style={{ padding: '26px 28px', marginTop: 26 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>What your budget buys</h2>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 580 }}>
        Spent in the order above, must-have first — the recommended stone when it fits, its
        stand-in when it doesn&rsquo;t.
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{rupees(budget)}</span>
        <span className="muted" style={{ fontSize: 12 }}>to spend</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
          <span className="muted" style={{ fontSize: 13 }}>₹</span>
          <input
            aria-label="Budget for gemstones, in rupees"
            inputMode="numeric"
            value={typed ?? String(budget)}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={(e) => { setBudget(clampBudget(Number(e.target.value.replace(/[^\d]/g, '')) || 0, ceiling)); setTyped(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ width: 96, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent',
              fontFamily: 'inherit', fontSize: 17, fontWeight: 700, color: 'var(--ink)', padding: '1px 2px', outline: 'none' }} />
        </span>
      </div>

      <input type="range" min={0} max={ceiling} step={step} value={budget}
        aria-label="Budget for gemstones"
        onChange={(e) => { setTyped(null); setBudget(Number(e.target.value)); }}
        style={{ width: '100%', margin: '14px 0 6px', accentColor: 'var(--accent)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 11 }}>Nothing</span>
        <span className="muted" style={{ fontSize: 11 }}>{rupees(ceiling)} — all of them, at their finest</span>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {picks.map(({ rec, pick, isSubstitute, shortBy }) => (
          <li key={rec.gem.id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <span className="gem-num" style={{ width: 24, height: 24, fontSize: 11.5, opacity: pick ? 1 : .45 }}>{rec.rank}</span>
            {pick
              ? <img className="no-case" src={pick.gem.image} alt="" aria-hidden loading="lazy" width={34} height={34}
                  style={{ width: 34, height: 34, objectFit: 'contain', mixBlendMode: 'multiply' }} />
              : <span aria-hidden style={{ width: 34 }} />}
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, textAlign: 'left' }}>
              {pick ? (
                <>
                  <strong>{pick.gem.name}</strong>
                  <span className="muted"> · {pick.weight?.carats} ct</span>
                  {/* Named as a stand-in rather than quietly swapped — somebody
                      who asked for a ruby and is shown a garnet should be told
                      which one they are looking at. */}
                  {isSubstitute && <span className="muted"> · standing in for {rec.gem.name.toLowerCase()}</span>}
                </>
              ) : (
                <span className="muted">
                  {rec.gem.name} — {shortBy !== null ? `${rupees(shortBy)} short of the cheapest way in` : 'nothing at this budget'}
                </span>
              )}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 84, textAlign: 'right' }}>
              {pick ? `from ${rupees(pick.fromInr as number)}` : '—'}
            </span>
            {/* THE SAME DOOR AS EVERY OTHER "ADD TO CART" IN THIS HUB, and
                that consistency is the point: nothing is ever locked without
                somebody having chosen how it is worn. Locking a loose stone
                from here would be quietly deciding that for them — and the
                figure beside it is the LOOSE price, so a ring bought that way
                would arrive with a weight of gold this section never showed. */}
            {pick && (
              inCart.has(pick.gem.id)
                ? <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, minWidth: 92, textAlign: 'right' }}>✓ In checkout</span>
                : (
                  <Link to={`/astrology/gemstones/${pick.gem.id}/design`}>
                    <Button variant="line" size="sm">Add to cart</Button>
                  </Link>
                )
            )}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>
          {got.length} of {picks.length} stone{picks.length === 1 ? '' : 's'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em' }}>{rupees(totalInr)}</span>
      </div>

      {/* NO "ADD ALL" BUTTON, and its absence is the same decision. Four stones
          are four commissions with four sets of choices in them; one button
          that locked all of them would have to invent every one of those. */}
      {(cart.data?.count ?? 0) > 0 && (
        <div style={{ marginTop: 14 }}>
          <Link to="/astrology/gem-checkout" style={{ fontSize: 12.5, fontWeight: 700 }}>
            Go to checkout ({cart.data?.count}) →
          </Link>
        </div>
      )}
      {budget - totalInr > 0 && got.length === picks.length && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' }}>
          {rupees(budget - totalInr)} left over. Everything your chart asks for is covered — the rest
          buys a finer grade of the same stones rather than another stone.
        </p>
      )}
      <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: '12px 0 0' }}>
        Stones only, at each one&rsquo;s starting grade and your prescribed weight. A ring or
        pendant adds a weight of gold that can cost more than the stone — that&rsquo;s priced in the studio,
        where these buttons go.
      </p>
    </Card>
  );
}

export function AstroGemstones() {
  const q = useAstroGemstones();
  const data = q.data;
  const needsProfile = Boolean(data && 'needsProfile' in data && data.needsProfile);

  return (
    <div>
      {/* ── THE PICTURE IS GONE (owner, 6 Sep): "remove the gemstone image."
          The masthead was a photograph of a jewelled field with the words on
          the bright half of it, and this room now opens the way the other five
          in the zone do — the shared header, the lede whole again with its own
          dash back, and the tab row under it.

          THE SENTENCE IS ONE SENTENCE AGAIN. The band had split it at the dash
          because a masthead needs a large line and a small one; nothing here
          needs that, and rejoining it is the same words in the form they were
          written. */}
      <AstroHeader
        title="Gemstones"
        lede="Only the stones your own chart calls for — what each one is for, which finger it is worn on, and what it costs."
      />
      <AstroTabs />

      {q.isLoading ? (
        <Spinner label="Reading your chart…" />
      ) : q.isError ? (
        <Card style={{ padding: '18px 22px' }}>
          <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
            We couldn’t read your chart just now. That’s a problem on our side, not your
            birth details — they’re untouched. Try again in a moment.
          </p>
        </Card>
      ) : needsProfile || !data ? (
        <NeedsProfileCard />
      ) : (
        <>
          {/* ── what this was read from ────────────────────────────────────
              A LABELLED STRIP, NOT PROSE. The zone's voice rule forbids a
              letter from naming the machinery; a panel of named fields is the
              standing exception, and somebody about to spend real money is owed
              the reason in the technical words as well as the plain ones. */}
          <div className="gem-chart">
            {([
              ['Ascendant', data.chart.ascendant ?? 'Birth time needed'],
              ['Moon sign', data.chart.moonSign],
              ['Current period', data.chart.mahadasha],
              ['Within it', data.chart.antardasha],
              ['Life path', String(data.chart.lifePath)],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <div className="muted" style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>

          {data.timeUnknown && (
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 640 }}>
              Two of the five stones are read from your ascendant, which needs the time you were
              born. Add it to your astrology profile and they appear — we haven’t guessed at them.
            </p>
          )}

          <div style={{ textAlign: 'center', margin: '0 0 20px' }}>
            <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Recommended for you</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              {data.recommendations.length} stone{data.recommendations.length === 1 ? '' : 's'} out of thirty. The rest of the
              catalogue is not shown, because it isn’t yours.
            </p>
            <p className="muted gem-tiles-note">
              Open a stone for the reading, the weight it is worn at and what it costs.
            </p>
          </div>

          {/* ── the shelf ──────────────────────────────────────────────
              ONE ROW, ONE SIZE, ONE TAP TO THE ANSWER. Four full sheets
              stacked down this page put four screens of reference in front of
              a decision nobody had made yet. The cards are the choosing; the
              sheet behind each one is the reading. */}
          <div className="gem-tiles">
            {data.recommendations.map((rec) => <GemTile key={rec.gem.id} rec={rec} />)}
          </div>

          {/* Last on the page on purpose: the question "what can I afford"
              only makes sense once somebody has read what they are choosing
              between. */}
          <BudgetPicker data={data} />

          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 20, textAlign: 'center', maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            {data.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * ── THE FOUR THINGS A BABY-CARE TILE HAS TO BE ABLE TO SAY ──────────────────
 *
 * Small components rather than four copies of a span, because each of them is a
 * CLAIM and a claim wants exactly one wording. The moment "prescription
 * required" is typed twice, one of the two gets softened.
 *
 * The skin is in `styles/babycare.css` — see its header for why this district
 * arrived with a stylesheet instead of a hundred inline objects.
 */

import { Link } from 'react-router-dom';
import type { BabyProduct, Gate } from '../types';

/** ── WHERE THE NUMBER CAME FROM ────────────────────────────────────────────
 *  Every commercial row in this hub carries the page it was read off and the
 *  day it was read. On the card, not behind a modal: "verified" is a claim, and
 *  a claim with no link under it is a logo. */
export function SourceLine({ product, checkedOn }: { product: BabyProduct; checkedOn: string }) {
  return (
    <p className="bc-source">
      <a href={product.source} target="_blank" rel="noreferrer">Source listing</a>
      {' · checked '}
      {checkedOn}
    </p>
  );
}

/** ── A PRICE, OR THE TRUTH ABOUT WHY THERE ISN'T ONE ───────────────────────
 *
 *  `mayBadge` is the IMS switch and it is a required prop rather than an
 *  optional one. A default of true is how a restricted row ends up wearing a
 *  "24% off" flash the first time somebody renders this component from a new
 *  page — which is the exact act s.3 of the IMS Act prohibits. Callers must
 *  answer the question. */
export function PriceLine(
  { product, mayBadge, size = 'md' }: { product: BabyProduct; mayBadge: boolean; size?: 'sm' | 'md' | 'lg' },
) {
  const cls = `bc-price is-${size}`;
  if (product.priceInr === null) {
    return <span className="bc-price-none">Price not verified at source</span>;
  }
  const mrp = product.mrpInr;
  const showMrp = mayBadge && mrp !== null && mrp > product.priceInr;
  const off = showMrp && mrp ? Math.round(((mrp - product.priceInr) / mrp) * 100) : null;
  return (
    <span className={cls}>
      <strong className="bc-price-now">{`₹${product.priceInr.toLocaleString('en-IN')}`}</strong>
      {showMrp && mrp && <span className="bc-price-was">{`₹${mrp.toLocaleString('en-IN')}`}</span>}
      {off !== null && off > 0 && <span className="bc-price-off">{off}% off</span>}
    </span>
  );
}

const GATE_WORDS: Record<Gate, { short: string; long: string }> = {
  pharmacy: {
    short: 'Pharmacy',
    long: 'A medicine. Sold through a pharmacy, and dosed by a doctor — not by this store.',
  },
  ayush: {
    short: 'AYUSH medicine',
    long: 'An AYUSH-licensed Ayurvedic medicine, not a toiletry. Its label carries an age limit.',
  },
  device: {
    short: 'Medical device',
    long: 'A medical device notified under India’s CDSCO rules, not general merchandise.',
  },
};

/** The mark a regulated row wears wherever it appears. */
export function GateMark({ gate, long = false }: { gate: Gate; long?: boolean }) {
  const w = GATE_WORDS[gate];
  return (
    <span className={`bc-tag bc-tag-gate${long ? ' is-long' : ''}`} title={w.long}>
      {long ? w.long : w.short}
    </span>
  );
}

/** A certification the product's own page printed. Never inferred — see the
 *  catalogue header's third rule. */
export function CertMark({ cert }: { cert: string }) {
  return <span className="bc-tag bc-tag-cert">{cert}</span>;
}

/**
 * WHAT THE SELLER SAID ABOUT AGE, IN THE SELLER'S OWN WORDS.
 *
 * Or, where the seller said nothing, a chip that says THAT — because a tile
 * with no age chip reads as a tile nobody bothered to label, and this shelf's
 * whole argument is that the blank is the seller's and not ours.
 */
export function AgeMark({ product }: { product: BabyProduct }) {
  const said = product.ageSaid;
  return (
    <span className={`bc-tag bc-tag-age${said ? '' : ' is-blank'}`}>
      {said ?? 'Age not stated by the seller'}
    </span>
  );
}

/**
 * ── THE NOTICE A RESTRICTED ROW CARRIES ───────────────────────────────────
 *
 * A shelf that quietly stops showing a discount and says nothing looks broken.
 * This says what was withheld and why, and links to the room where the whole
 * argument is written down.
 */
export function RestrictedNote({ reason }: { reason: string }) {
  return (
    <div className="bc-restricted">
      <strong>Mother’s milk is best for your baby</strong>
      <p>{reason}</p>
      <Link to="/babycare/safety">Why this shelf works this way</Link>
    </div>
  );
}

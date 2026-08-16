import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import {
  useStore, useBag, useSaveBag, useOrders, usePlaceOrder, serverSaid,
  type StoreProduct, type Yours,
} from '@/api/store.api';

/**
 * THE SUPPLEMENT STORE.
 *
 * The plan page shipped this morning with the prices stripped out and an
 * argument in the commit message: selling is a different act from advising,
 * and a page doing both cannot be trusted with the second, because the moment
 * a refusal costs revenue the refusals get quieter. This is the shelf coming
 * back as its own screen, which is what that argument asked for — with the
 * refusals still standing on it, and now with a till.
 *
 * THE PHOTOGRAPH AND THE DOOR ARE BACK — owner's store reference, 16 Aug,
 * reversing the 15-Aug "nothing leaves the city" rule. Every card shows the
 * retailer's own photograph of the product (the drawn pack stands behind it
 * as the fallback) and carries a "See the product ↗" door to the page that
 * sells it — the shape the Beauty market has always had. What did NOT
 * reverse: the till is the city's. Paying happens here, from the one city
 * wallet, and a bottle of D3 still lands in the Financial hub's monthly
 * spending beside a dinner.
 *
 * TWELVE PRODUCTS SIT UNDER SUPPLEMENTS THE ENGINE REFUSES, and they are
 * buyable. Hiding them does not stop the purchase — it only means it happens
 * somewhere that never showed anybody the trials. The friction is at the
 * CHECKOUT rather than at the shelf: adding one is free, and paying for one
 * means reading, once, the trial that argues against it. Checkout is also the
 * only place that friction survives a page reload, which is why it is there
 * and not on the Add button.
 *
 * TWO PRODUCTS ARE PRESCRIPTION-ONLY IN INDIA and have no Add button at all —
 * their card points at the Medicines hub, which is an internal door. Three
 * more have no single recorded price (a range, or no stock), and rather than
 * charging the middle of a range this city says it cannot sell them.
 *
 * THIS FILE DOES NO ARITHMETIC ANYBODY IS CHARGED FOR. Every total it draws is
 * one the server sent back, including the bag's. It sends ids and quantities
 * and nothing else — there is no price in any request this page makes.
 */

const BUCKET_BADGE: Record<Yours['bucket'], { label: string; strong: boolean }> = {
  priority: { label: 'On your plan · needs attention', strong: true },
  consider: { label: 'On your plan · worth considering', strong: true },
  optional: { label: 'On your plan · supporting your goal', strong: false },
  'not-recommended': { label: 'Mira doesn’t recommend this', strong: true },
};

const GRADE_LABEL: Record<string, string> = {
  strong: 'Strong evidence', moderate: 'Moderate evidence',
  emerging: 'Emerging — unproven', 'null-or-harm': 'Null or harmful',
};

type SortKey = 'plan' | 'cheap' | 'dear' | 'evidence';

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'plan', label: 'What your plan says' },
  { id: 'evidence', label: 'Strength of evidence' },
  { id: 'cheap', label: 'Price, lowest first' },
  { id: 'dear', label: 'Price, highest first' },
];

const BUCKET_RANK: Record<string, number> = { priority: 0, consider: 1, optional: 2, 'not-recommended': 4 };
const GRADE_RANK: Record<string, number> = { strong: 0, moderate: 1, emerging: 2, 'null-or-harm': 3 };

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * THE PACK, DRAWN RATHER THAN PHOTOGRAPHED.
 *
 * The evidence review rendered every dosage format itself and carried a shape
 * and a colour on each row, so the grid draws its own strips, blisters,
 * sachets and tubs from those two fields. It was already the faster choice;
 * now that this city sells the products rather than pointing at the shops that
 * do, hotlinking those shops' product photography would also be the wrong one.
 */
function Pack({ shape, colour }: { shape?: string; colour?: string }) {
  /**
   * THE PACK IS DRAWN OUT OF TOKENS, AND NOT BECAUSE A TEST SAID SO.
   *
   * `colour` is DATA — the evidence review carries one per row and it is the
   * only thing here allowed to be a literal, because it belongs to the product
   * rather than to the city. Everything else was: #8a8a8a for a row with no
   * colour, #f2f2f2 and #d8d8d8 for the pack, #dcdcdc for the printed lines,
   * #e2e2e2 for a sachet's seal. Five greys chosen against a white card.
   *
   * On the night hub's #0e0f10 card those five are a light-grey box floating on
   * black. A drawn pack that only works on one ground is a picture of a pack.
   * The body is the recessed surface, the outline is the hairline, and the
   * printing is the subdued ink at low opacity — so the whole thing re-inks
   * itself wherever it is put, which is what every other surface in the city
   * already does.
   */
  const ink = colour || 'var(--muted)';
  const body = { fill: 'var(--wash)', stroke: 'var(--line)', strokeWidth: 1 };
  /** Printed on the pack rather than part of it: the same ink, much quieter. */
  const print = { fill: 'var(--muted)', opacity: 0.22 };
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" role="presentation" aria-hidden="true">
      {shape === 'strip' && (
        <g><rect x="26" y="20" width="68" height="80" rx="6" {...body} />
          <rect x="26" y="20" width="68" height="18" rx="6" fill={ink} />
          <rect x="36" y="50" width="48" height="3" rx="1.5" {...print} />
          <rect x="36" y="60" width="48" height="3" rx="1.5" {...print} />
          <rect x="36" y="70" width="30" height="3" rx="1.5" {...print} /></g>
      )}
      {shape === 'blister' && (
        <g><rect x="22" y="26" width="76" height="68" rx="5" {...body} />
          {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
            <circle key={`${r}-${c}`} cx={38 + c * 22} cy={42 + r * 20} r="7" fill={ink} opacity={0.85} />
          )))}</g>
      )}
      {shape === 'sachet' && (
        <g><path d="M30 28h60v64H30z" {...body} />
          <path d="M30 28h60v14H30z" fill={ink} />
          <path d="M30 88h60v6H30z" {...print} opacity={0.18} /></g>
      )}
      {shape === 'syrup' && (
        <g><rect x="46" y="16" width="28" height="14" rx="3" fill={ink} />
          <path d="M44 30h32l8 18v46a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6V48z" {...body} />
          <rect x="46" y="58" width="28" height="26" rx="3" fill={ink} opacity={0.3} /></g>
      )}
      {shape === 'jar' && (
        <g><rect x="30" y="24" width="60" height="12" rx="4" fill={ink} />
          <rect x="34" y="36" width="52" height="60" rx="7" {...body} />
          <rect x="42" y="56" width="36" height="22" rx="3" fill={ink} opacity={0.28} /></g>
      )}
      {shape === 'pouch' && (
        <g><path d="M34 24h52v72a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4z" {...body} />
          <path d="M34 24h52v10H34z" fill={ink} />
          <rect x="44" y="52" width="32" height="26" rx="3" fill={ink} opacity={0.25} /></g>
      )}
      {shape === 'tub' && (
        <g><rect x="26" y="22" width="68" height="14" rx="5" fill={ink} />
          <rect x="30" y="36" width="60" height="62" rx="6" {...body} />
          <rect x="38" y="54" width="44" height="28" rx="3" fill={ink} opacity={0.3} /></g>
      )}
      {(shape === 'bottle-tab' || shape === 'bottle-cap' || shape === 'bottle-soft' || !shape) && (
        <g><rect x="50" y="16" width="20" height="12" rx="3" fill={ink} />
          <rect x="36" y="28" width="48" height="70" rx="8" {...body} />
          <rect x="42" y="48" width="36" height="30" rx="3" fill={ink} opacity={0.3} /></g>
      )}
    </svg>
  );
}

/**
 * THE PHOTOGRAPH, WITH THE DRAWN PACK STANDING BEHIND IT. The image is
 * hotlinked from the retailer's CDN — the same deal the Beauty market makes —
 * so it may be slow and it may be gone. A card must never show a broken
 * frame: no image on the wire, or an image that fails, falls through to the
 * pack this city draws for itself, which is what every card showed before
 * the owner's 16-Aug reference put the photographs back.
 */
function Shot({ p }: { p: StoreProduct }) {
  const [broken, setBroken] = useState(false);
  if (!p.image || broken) return <Pack shape={p.pack} colour={p.colour} />;
  return (
    <img src={p.image} alt="" loading="lazy" onError={() => setBroken(true)}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: 'var(--card)' }} />
  );
}

/** The door to the page that sells it. A link, not a button — leaving is
 *  allowed, it just isn't the transaction. */
function SeeIt({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 600 }}>
      See the product ↗
    </a>
  );
}

function Badge({ yours, personalised }: { yours?: Yours | null; personalised: boolean }) {
  if (!personalised) return null;
  if (!yours) {
    return <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 8 }}>Your plan has no opinion on this one</span>;
  }
  const b = BUCKET_BADGE[yours.bucket];
  const refused = yours.bucket === 'not-recommended';
  return (
    <span style={{
      display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700,
      letterSpacing: '.05em', textTransform: 'uppercase', padding: '5px 9px',
      borderRadius: 'var(--r-2)',
      background: refused ? 'var(--ink)' : 'var(--well)',
      color: refused ? 'var(--paper)' : 'var(--ink)',
      opacity: b.strong ? 1 : 0.75,
    }}>{b.label}</span>
  );
}

/**
 * THE BUY CONTROL, AND ITS THREE REFUSALS.
 *
 * A prescription medicine, a product with no single price, and everything
 * else. The first two do not get a disabled button — a greyed-out control
 * that never says why is the shape of a bug — they get a sentence and, where
 * there is somewhere to go, a door.
 */
function Buy({ p, qty, busy, onSet }: {
  p: StoreProduct; qty: number; busy: boolean; onSet: (n: number) => void;
}) {
  if (p.rx) {
    return (
      <div style={{ marginTop: 12 }}>
        <Link className="btn btn-sm" to="/medical/medicines">Needs a prescription →</Link>
        <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
          Prescription-only in India. It starts in Medicines, not at a checkout.
        </span>
      </div>
    );
  }
  if (!p.sellable) {
    return (
      <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
        Not sold here — the review found a price range or no stock, and this city won’t pick a number.
      </span>
    );
  }
  if (qty > 0) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button type="button" className="btn btn-sm" disabled={busy}
          aria-label={`One fewer ${p.name}`} onClick={() => onSet(qty - 1)}>−</button>
        <b style={{ fontSize: 14, minWidth: 18, textAlign: 'center' }}>{qty}</b>
        <button type="button" className="btn btn-sm" disabled={busy || qty >= 12}
          aria-label={`One more ${p.name}`} onClick={() => onSet(qty + 1)}>+</button>
        <span className="muted" style={{ fontSize: 11.5 }}>in your bag</span>
      </div>
    );
  }
  return (
    <button type="button" className="btn btn-sm" style={{ marginTop: 12 }} disabled={busy}
      onClick={() => onSet(1)}>Add · {rupees(p.priceInr ?? 0)}</button>
  );
}

function Tile({ p, personalised, qty, busy, onOpen, onSet }: {
  p: StoreProduct; personalised: boolean; qty: number; busy: boolean;
  onOpen: () => void; onSet: (n: number) => void;
}) {
  const refused = p.yours?.bucket === 'not-recommended';
  return (
    <article className="card rise" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <button type="button" onClick={onOpen} aria-label={`About ${p.brand} ${p.name}`} style={{
        border: 0, background: 'var(--well)', borderRadius: 'var(--r-2)', padding: 0,
        cursor: 'pointer', aspectRatio: '1 / 1', position: 'relative', overflow: 'hidden',
      }}>
        <Shot p={p} />
        {p.rx ? (
          <span style={{
            position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 800,
            letterSpacing: '.08em', padding: '3px 7px', borderRadius: 'var(--r-1)',
            background: 'var(--ink)', color: 'var(--paper)',
          }}>℞ ONLY</span>
        ) : null}
      </button>

      <span className="eyebrow" style={{ marginTop: 10 }}>{p.brand}</span>
      <b style={{ fontSize: 14.5, lineHeight: 1.35, letterSpacing: '-.01em', color: refused ? 'var(--muted)' : 'var(--ink)' }}>{p.name}</b>
      {p.strength ? <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{p.strength}</span> : null}

      {/* The review's own markers — VEGAN, REPLETION ONLY, LABELLED 100% RDA —
          on the card face, as the owner's reference draws them. Three at most;
          the rest wait in the detail. */}
      {(p.tags ?? []).length > 0 && (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {(p.tags ?? []).slice(0, 3).map((t) => <span key={t} className="tag" style={{ fontSize: 10.5 }}>{t}</span>)}
        </span>
      )}

      <span style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>
        {typeof p.priceInr === 'number' ? rupees(p.priceInr) : <span className="muted" style={{ fontWeight: 400 }}>No single price recorded</span>}
      </span>
      {p.price ? <span className="muted" style={{ fontSize: 11.5 }}>{p.price}</span> : null}

      <Badge yours={p.yours} personalised={personalised} />
      <Buy p={p} qty={qty} busy={busy} onSet={onSet} />
      <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={onOpen}>Read first</button>
      <SeeIt url={p.url} />
    </article>
  );
}

function Detail({ p, personalised, qty, busy, onSet, onClose }: {
  p: StoreProduct; personalised: boolean; qty: number; busy: boolean;
  onSet: (n: number) => void; onClose: () => void;
}) {
  const refused = p.yours?.bucket === 'not-recommended';
  return (
    <section className="card rise" style={{ padding: '18px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 150, flex: 'none', background: 'var(--well)', borderRadius: 'var(--r-2)', overflow: 'hidden', aspectRatio: '1 / 1' }}>
          <Shot p={p} />
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="eyebrow">{p.brand}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {p.supplementName}{p.grade ? ` · ${GRADE_LABEL[p.grade] ?? p.grade}` : ''}{p.gradeFor ? ` · ${p.gradeFor}` : ''}
            </span>
            <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
          </div>
          <h2 style={{ fontSize: 21, letterSpacing: '-.02em', margin: '4px 0 2px' }}>{p.name}</h2>
          {p.strength ? <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{p.strength}</p> : null}

          <Badge yours={p.yours} personalised={personalised} />
          {p.yours?.why ? (
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '10px 0 0' }}>
              {p.yours.why}
              {p.yours.source ? <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 3 }}>{p.yours.source}</span> : null}
            </p>
          ) : null}
          {p.yours?.needsClinician ? (
            <p style={{ fontSize: 13, margin: '10px 0 0', fontWeight: 600 }}>
              ⚠︎ Your plan puts this one in front of a doctor before a first dose.
            </p>
          ) : null}
          {p.testFirst ? (
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
              A blood test belongs before the first dose of this one, not after it.
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
            <span><span className="eyebrow">Published range</span>
              <span style={{ display: 'block', fontSize: 14 }}>{p.typicalDose ?? '—'}</span></span>
            {p.upperLimit ? <span><span className="eyebrow">Upper limit</span>
              <span style={{ display: 'block', fontSize: 14 }}>{p.upperLimit}</span></span> : null}
            {p.formToBuy ? <span><span className="eyebrow">Form worth buying</span>
              <span style={{ display: 'block', fontSize: 14 }}>{p.formToBuy}</span></span> : null}
            <span><span className="eyebrow">Stocked in India by</span>
              <span style={{ display: 'block', fontSize: 14 }}>{p.retailer}</span>
              <SeeIt url={p.url} /></span>
          </div>

          {(p.tags ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
              {(p.tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}

          <Buy p={p} qty={qty} busy={busy} onSet={onSet} />

          {refused ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, margin: '12px 0 0' }}>
              It is on sale here because hiding it would not stop the purchase — it would only mean you
              made it somewhere that never showed you the trials. The checkout will ask you to read that
              once before it takes any money.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function Store() {
  const q = useStore();
  const bagQ = useBag();
  const ordersQ = useOrders();
  const save = useSaveBag();
  const pay = usePlaceOrder();

  const [aisle, setAisle] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<SortKey>('plan');
  const [mineOnly, setMineOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [read, setRead] = useState(false);

  const personalised = q.data?.personalised ?? false;
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const aisles = useMemo(() => q.data?.aisles ?? [], [q.data]);
  const bagLines = useMemo(() => bagQ.data?.lines ?? [], [bagQ.data]);
  const qtyOf = (id: string) => bagLines.find((l) => l.id === id)?.qty ?? 0;

  /** Every change replaces the bag wholesale — the server owns what a bag may
   *  contain, so there is no increment endpoint to race against itself. */
  const setQty = (id: string, n: number) => {
    const next = bagLines
      .map((l) => ({ id: l.id, qty: l.id === id ? n : l.qty }))
      .filter((l) => l.qty > 0);
    if (n > 0 && !bagLines.some((l) => l.id === id)) next.push({ id, qty: n });
    save.mutate(next);
  };

  const shown = useMemo(() => {
    const inAisle = aisles.find((a) => a.id === aisle);
    const needle = term.trim().toLowerCase();
    const rows = items.filter((p) => {
      if (inAisle && !(inAisle.supplements ?? []).includes(p.supplement)) return false;
      if (mineOnly && (!p.yours || p.yours.bucket === 'not-recommended')) return false;
      if (!needle) return true;
      return [p.brand, p.name, p.supplementName, p.strength, p.retailer, ...(p.tags ?? [])]
        .filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
    const byPlan = (p: StoreProduct) => (p.yours ? BUCKET_RANK[p.yours.bucket] ?? 3 : 3);
    return [...rows].sort((a, b) => {
      if (sort === 'cheap') return (a.priceFrom ?? Number.MAX_SAFE_INTEGER) - (b.priceFrom ?? Number.MAX_SAFE_INTEGER);
      if (sort === 'dear') return (b.priceFrom ?? -1) - (a.priceFrom ?? -1);
      if (sort === 'evidence') return (GRADE_RANK[a.grade ?? ''] ?? 9) - (GRADE_RANK[b.grade ?? ''] ?? 9);
      return byPlan(a) - byPlan(b) || (GRADE_RANK[a.grade ?? ''] ?? 9) - (GRADE_RANK[b.grade ?? ''] ?? 9);
    });
  }, [items, aisles, aisle, term, sort, mineOnly]);

  const opened = items.find((p) => p.id === open) ?? null;
  const busy = save.isPending || pay.isPending;

  /* WHICH LINES THIS CITY RECOMMENDS AGAINST. Read off the plan the store
     already carries, and checked again by the server — the checkbox below is
     the question, not the enforcement. */
  const refusedLines = bagLines.filter(
    (l) => items.find((p) => p.id === l.id)?.yours?.bucket === 'not-recommended',
  );
  const canPay = (bagQ.data?.totalInr ?? 0) > 0 && (refusedLines.length === 0 || read);
  const payError = serverSaid(pay.error);

  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Fitness · 09</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>The supplement store</h1>
          <p className="lede" style={{ marginTop: 6 }}>
            Everything the evidence review found actually being sold in India — including the ones it
            tells you not to buy, with the reason attached. Paid from your city wallet, here.
          </p>
        </div>
      </div>

      {q.isLoading ? <Spinner label="Opening the store…" /> : q.isError ? (
        <section className="card rise" style={{ padding: '18px 20px' }}>
          <b style={{ display: 'block', fontSize: 16 }}>The shelf didn’t load</b>
          <p className="muted" style={{ margin: '6px 0 12px' }}>
            Nothing was lost and nothing was charged. An empty shop here would read as “there is nothing
            worth taking”, which is a claim we haven’t checked.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => void q.refetch()}>Try again</button>
        </section>
      ) : (
        <>
          <section className="card rise" style={{ padding: '13px 18px', marginBottom: 16 }}>
            {personalised ? (
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
                Every card carries what <Link to="/fitness/supplements">your own plan</Link> says about it —
                read from your blood work, your medicines, your diet and your goal.
                {q.data?.basis?.bloodWork?.takenOn
                  ? ` Blood work of ${q.data.basis.bloodWork.takenOn}.`
                  : ' No blood test on file yet, so most of these are still base rates for the country.'}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
                Your plan couldn’t be read just now, so there are no verdicts on these cards. A blank card
                is not an approval — <Link to="/fitness/supplements">the plan page</Link> is where the
                opinion lives.
              </p>
            )}
          </section>

          {/* ── THE BAG ────────────────────────────────────────────────────
              Above the shelf rather than below it, because it is the thing
              with money in it and a total somebody is about to agree to
              should never be the part of a page you have to go looking for. */}
          {bagLines.length > 0 && (
            <section className="card rise" style={{ padding: '16px 18px', marginBottom: 18 }}>
              <b style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>Your bag · {bagLines.length}</b>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {bagLines.map((l) => (
                  <li key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ width: 34, height: 34, flex: 'none', background: 'var(--well)', borderRadius: 'var(--r-1)', overflow: 'hidden' }}>
                      <Pack shape={l.pack} colour={l.colour} />
                    </span>
                    <span style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <b style={{ fontSize: 13.5 }}>{l.name ?? 'No longer on the shelf'}</b>
                      <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>
                        {l.gone
                          ? 'This one has left the shelf — remove it to pay for the rest'
                          : l.sellable ? `${l.brand} · ${l.price ?? ''}` : 'Can’t be sold here'}
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button type="button" className="btn btn-sm" disabled={busy}
                        aria-label={`One fewer ${l.name ?? 'item'}`} onClick={() => setQty(l.id, l.qty - 1)}>−</button>
                      <b style={{ fontSize: 13.5, minWidth: 16, textAlign: 'center' }}>{l.qty}</b>
                      <button type="button" className="btn btn-sm" disabled={busy || l.qty >= 12}
                        aria-label={`One more ${l.name ?? 'item'}`} onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                    </span>
                    <b style={{ fontSize: 13.5, minWidth: 64, textAlign: 'right' }}>
                      {typeof l.lineTotalInr === 'number' ? rupees(l.lineTotalInr) : '—'}
                    </b>
                  </li>
                ))}
              </ul>

              {(bagQ.data?.unsellable ?? 0) > 0 && (
                <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.55 }}>
                  {bagQ.data?.unsellable} of these can’t go through this checkout and are not in the total.
                  They are still listed rather than deleted — a bag that quietly empties itself is a bag
                  that lies about what you asked for.
                </p>
              )}

              {/* THE ONE PIECE OF FRICTION ON THIS PAGE, and it is at the till
                  rather than at the shelf: adding a refused product is free,
                  paying for one means reading the trial once. The server
                  checks this too — a confirmation nothing verifies is
                  decoration. */}
              {refusedLines.length > 0 && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--well)', borderRadius: 'var(--r-2)' }}>
                  <b style={{ display: 'block', fontSize: 14 }}>
                    {refusedLines.length === 1 ? 'One of these is on your plan’s do-not-buy list' : `${refusedLines.length} of these are on your plan’s do-not-buy list`}
                  </b>
                  <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 8 }}>
                    {refusedLines.map((l) => {
                      const p = items.find((x) => x.id === l.id);
                      return (
                        <li key={l.id} style={{ fontSize: 13, lineHeight: 1.55 }}>
                          <b>{l.name}</b>
                          {p?.yours?.why ? <span className="muted"> — {p.yours.why}</span> : null}
                          {p?.yours?.source ? <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{p.yours.source}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 13 }}>
                    <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
                    <span>I’ve read that, and I still want to buy it.</span>
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{rupees(bagQ.data?.totalInr ?? 0)}</span>
                <button type="button" className="btn" disabled={busy || !canPay}
                  onClick={() => pay.mutate({
                    items: bagLines.filter((l) => l.sellable).map((l) => ({ id: l.id, qty: l.qty })),
                    acknowledged: refusedLines.map((l) => l.id),
                  })}>
                  {pay.isPending ? 'Paying…' : `Pay ${rupees(bagQ.data?.totalInr ?? 0)} from your wallet`}
                </button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => save.mutate([])}>Empty the bag</button>
              </div>

              {payError ? (
                <p style={{ fontSize: 13, margin: '10px 0 0', fontWeight: 600 }}>{payError}</p>
              ) : pay.isError ? (
                <p style={{ fontSize: 13, margin: '10px 0 0', fontWeight: 600 }}>
                  That didn’t go through, and nothing was taken. Try again in a moment.
                </p>
              ) : null}
              <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.55 }}>
                Paid from your one city wallet, the same as anything else here, and it shows up in your
                Financial hub under Fitness. Prices were read when the review was compiled.
              </p>
            </section>
          )}

          {/* THE COUNTER. */}
          <section style={{ marginBottom: 18, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="chip" aria-pressed={aisle === null} onClick={() => setAisle(null)}>Everything</button>
              {aisles.map((a) => (
                <button key={a.id} type="button" className="chip" aria-pressed={aisle === a.id}
                  onClick={() => setAisle(a.id === aisle ? null : a.id)}>{a.title}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                <label className="eyebrow" htmlFor="store-search" style={{ display: 'block', marginBottom: 4 }}>Search</label>
                <input id="store-search" type="search" value={term} onChange={(e) => setTerm(e.target.value)}
                  aria-label="Search the store by brand, product or supplement"
                  placeholder="Brand, product, or what’s in it"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' }} />
              </span>
              <span>
                <label className="eyebrow" htmlFor="store-sort" style={{ display: 'block', marginBottom: 4 }}>Order by</label>
                <select id="store-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                  style={{ padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' }}>
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </span>
              {personalised ? (
                <button type="button" className="chip" aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)}>
                  Only what your plan supports
                </button>
              ) : null}
            </div>

            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              {shown.length} of {items.length} products{aisle ? ` · ${aisles.find((a) => a.id === aisle)?.blurb ?? ''}` : ''}
            </p>
          </section>

          {opened ? (
            <Detail p={opened} personalised={personalised} qty={qtyOf(opened.id)} busy={busy}
              onSet={(n) => setQty(opened.id, n)} onClose={() => setOpen(null)} />
          ) : null}

          <section style={{ display: 'grid', gap: 14, marginBottom: 24, gridTemplateColumns: 'repeat(auto-fill, minmax(216px, 1fr))' }}>
            {shown.map((p) => (
              <Tile key={p.id} p={p} personalised={personalised} qty={qtyOf(p.id)} busy={busy}
                onOpen={() => setOpen(p.id)} onSet={(n) => setQty(p.id, n)} />
            ))}
          </section>

          {shown.length === 0 ? (
            <section className="card rise" style={{ padding: '18px 20px', marginBottom: 24 }}>
              <b style={{ display: 'block', fontSize: 15 }}>Nothing on this shelf matches that</b>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
                Three of the nineteen supplements in the review — folate, L-theanine and standalone K2 —
                have no verified Indian product at all, so they are in the plan and not in the shop.
              </p>
            </section>
          ) : null}

          {/* WHAT WAS BOUGHT. Nutrition once shipped a checkout that charged
              the wallet and rendered none of it, so a citizen paid and had
              nowhere to look. This is the reader that makes the writer
              allowed to exist. */}
          {(ordersQ.data ?? []).length > 0 && (
            <Fold title="What you’ve bought here" meta={`${(ordersQ.data ?? []).length} orders`}>
              <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 12 }}>
                {(ordersQ.data ?? []).map((o) => (
                  <li key={o.id}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 14 }}>{rupees(o.totalInr)}</b>
                      <span className="muted" style={{ fontSize: 12 }}>{o.createdAt.slice(0, 10)} · {o.status}</span>
                    </div>
                    <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                      {o.items.map((i) => `${i.name} × ${i.qty}`).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
                Each line is what it cost on the day you bought it. A receipt that changes when a shelf
                price changes is not a receipt.
              </p>
            </Fold>
          )}

          {q.data && (
            <Fold title="Where this shelf came from" meta={`${items.length} products · ${q.data.source.assessed} supplements assessed`}>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>
                <b>{q.data.source.title}</b>
                {q.data.source.reviewed ? ` · reviewed ${q.data.source.reviewed}` : ''}
              </p>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
                Every product here was read out of that review’s own “available in India” tables, and every
                one resolves to a supplement it assessed — a bottle this city can show but cannot cite is a
                bottle it has no business showing. Dietary supplements are not pre-approved for safety or
                effectiveness the way medicines are, and under FSSAI’s rules a product advertising a
                megadose is either a licensed drug, a grey import, or non-compliant.
              </p>
            </Fold>
          )}
        </>
      )}
    </div>
  );
}

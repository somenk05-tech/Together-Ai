import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import { useStore, useBag, useSaveBag, type StoreProduct, type Yours } from '@/api/store.api';
import { Buy, Shot } from '../components/PackShot';

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
 * THE PHOTOGRAPH IS BACK; THE DOOR IS NOT. Two owner's calls on 16 Aug,
 * hours apart: every card shows the retailer's own photograph (the drawn
 * pack stands behind it as the fallback), and "See the product" came off —
 * nothing on this page routes anybody out to a rival checkout. Buying is
 * the Beauty hub's shape now, taken whole: Add on the shelf, ONE BAG BAR at
 * the foot of the page, and a checkout PAGE at /fitness/orders where the
 * bag is laid out line by line and the wallet moves. A bottle of D3 still
 * lands in the Financial hub's monthly spending beside a dinner.
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
  /* The plan's own words, and they changed with it (owner, 16 Aug): one
     verdict rendered on two screens under two different names is two
     verdicts to the person reading them. */
  'not-recommended': { label: 'We don’t recommend this', strong: true },
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

/* The drawn pack and the photograph live in ../components/PackShot now —
   the orders page draws the same bag lines, and two copies of a fallback are
   two behaviours the day one of them is fixed. */

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

/* The buy control moved to ../components/PackShot — the plan page sells the
   products behind its own recommendations now, and a second copy of "what may
   be bought" is a second answer the first time either is corrected. */

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
        <Shot image={p.image} pack={p.pack} colour={p.colour} />
        {p.rx ? (
          <span style={{
            position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 800,
            letterSpacing: '.08em', padding: '3px 7px', borderRadius: 'var(--r-1)',
            background: 'var(--ink)', color: 'var(--paper)',
          }}>℞ ONLY</span>
        ) : null}
      </button>

      <span className="eyebrow" style={{ marginTop: 10 }}>{p.brand}</span>
      <b style={{ fontSize: 15, lineHeight: 1.35, letterSpacing: '-.01em', color: refused ? 'var(--muted)' : 'var(--ink)' }}>{p.name}</b>
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
          <Shot image={p.image} pack={p.pack} colour={p.colour} />
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="eyebrow">{p.brand}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {p.supplementName}{p.grade ? ` · ${GRADE_LABEL[p.grade] ?? p.grade}` : ''}{p.gradeFor ? ` · ${p.gradeFor}` : ''}
            </span>
            <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
          </div>
          <h2 style={{ fontSize: 20, letterSpacing: '-.02em', margin: '4px 0 2px' }}>{p.name}</h2>
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
              <span style={{ display: 'block', fontSize: 14 }}>{p.retailer}</span></span>
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
  const save = useSaveBag();

  const [aisle, setAisle] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<SortKey>('plan');
  const [mineOnly, setMineOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

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
  const busy = save.isPending;

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

          {/* ── THE BAG BAR — the Beauty hub's shape, taken whole. ─────────
              ONE BAR, ONE BAG, ONE TOTAL, and it is the LAST block of the
              page: you reach it by getting to the end, which is also when
              you have finished deciding. Checkout is a LINK, not a payment
              sheet — it goes to My Orders, where the bag is laid out line by
              line with the wallet under it. Nothing is charged before that
              page. */}
          {bagLines.length > 0 && (
            <section className="card rise" style={{
              marginTop: 22, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>
                  {bagLines.length} item{bagLines.length === 1 ? '' : 's'} · {rupees(bagQ.data?.totalInr ?? 0)}
                </b>
                <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                  {bagLines.map((l) => `${l.name ?? 'No longer sold'}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ')}
                </span>
                {(bagQ.data?.unsellable ?? 0) > 0 && (
                  <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 3 }}>
                    {bagQ.data?.unsellable} of these can’t be sold here and {(bagQ.data?.unsellable ?? 0) === 1 ? 'is' : 'are'} not in the total.
                  </span>
                )}
              </div>
              <Link className="btn" style={{ marginLeft: 'auto' }} to="/fitness/orders">
                Checkout · {rupees(bagQ.data?.totalInr ?? 0)}
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  );
}

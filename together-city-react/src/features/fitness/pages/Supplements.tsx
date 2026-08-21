import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import { useSupplementPlan, type Bucket, type Recommendation } from '@/api/supplements.api';
import { useStore, useBag, useSaveBag, type StoreProduct } from '@/api/store.api';
import { Buy, Shot } from '../components/PackShot';

/**
 * YOUR SUPPLEMENT PLAN.
 *
 * WHAT THIS PAGE USED TO BE. Eight products with a price and a sentence,
 * ordered by a hardcoded `HEALTH = { weightKg: 65 }` that belonged to nobody —
 * and three of the eight were a daily multivitamin, D3+K2 and BCAA/EAA, all
 * three of which the owner's own evidence review puts on its skip list, two of
 * them beside trials that found harm. It was a shop that used the word
 * "recommended". Nothing about it was personal and nothing in it was cited.
 *
 * WHAT IT IS NOW. A read of `GET /fitness/supplements`, which resolves the
 * citizen's blood work (through the medical hub's consent gate), diet,
 * medicines, conditions and goal against a knowledge base built from that
 * review. This file renders the answer and NOTHING ELSE — there is no
 * arithmetic here, no threshold, no dose, no "if low then". Every number and
 * every claim on this screen arrived from the server with a source attached,
 * because a rule enforced in one place is a rule, and a rule enforced in two
 * is a coincidence waiting to end.
 *
 * FOUR BUCKETS, AND THE FOURTH IS THE POINT. Priority, consider, optional —
 * and the things the evidence says NOT to take, with the trial that says so.
 * A supplement screen that can only ever suggest buying something is an
 * advertisement with a chart on it.
 *
 * AND NOW IT SELLS WHAT IT SUPPORTS — owner's call, 16 Aug, and it reverses a
 * rule, so the argument goes here rather than in a commit nobody re-reads.
 *
 * THE OLD RULE was no price and no Add anywhere on this page: selling is a
 * different act from advising, and a page doing both cannot be trusted with
 * the second, because the moment a refusal costs revenue the refusals get
 * quieter. That risk has not gone away. What changed is where the till
 * stands — a citizen reading "your LDL is 132, and psyllium is the one answer
 * here with high-certainty evidence behind it" should not then have to go and
 * find the isabgol themselves on a shelf of forty-three bottles.
 *
 * SO THE ASYMMETRY IS THE GUARD. Under a priority, consider or optional card
 * sits "Available in India" — the products the review found for that
 * supplement, with an Add. Under a REFUSED card there is no product, no price
 * and no button, ever. The refusal costs this page revenue BY CONSTRUCTION,
 * which is what stops it quietly softening to earn some. Those twelve
 * products are still buyable — hiding them would not stop the purchase, it
 * would only move it somewhere that never showed anybody the trials — but
 * they are buyable in the store, where the checkout makes you read the trial
 * first.
 *
 * THE BAG IS THE SAME BAG. One bag, one total, the store's own: added from
 * here, edited anywhere, paid at /fitness/orders. A second bag on the page
 * that advises would be exactly the shop this hub refuses to be.
 */

const BUCKETS: Array<{ id: Bucket; dot: string; title: string; blurb: string }> = [
  { id: 'priority', dot: '🔴', title: 'Needs attention', blurb: 'Your own data points at a gap here.' },
  { id: 'consider', dot: '🟠', title: 'Worth considering', blurb: 'A reasonable fit for your diet, goal or medicines — not essential.' },
  { id: 'optional', dot: '🟢', title: 'Supporting your goal', blurb: 'May help. Your fundamentals matter more.' },
  /* THE CITY'S RECOMMENDATION, NOT AN ASSISTANT'S — owner, 16 Aug. A refusal
     under a name reads as one voice's opinion; this one is the evidence
     review resolved against the citizen's own hubs, and every card beneath
     carries the trial that decided it. The engine is unchanged: this is the
     heading, and only the heading. */
  { id: 'not-recommended', dot: '⚪', title: 'We don’t recommend these', blurb: 'The most useful part of this page.' },
];

const FROM_LABEL: Record<string, string> = {
  lab: 'Blood work', diet: 'Diet', goal: 'Goal', fitness: 'Training',
  medicine: 'Medicines', population: 'India', evidence: 'Evidence',
};

const GRADE_LABEL: Record<string, string> = {
  strong: 'Strong evidence', moderate: 'Moderate evidence',
  emerging: 'Emerging — unproven', 'null-or-harm': 'Null or harmful',
};

/** A reason, with the thing it came from named beside it. The tag is the whole
 *  point: "67% of Indian adults" and "your ferritin is 9" are different kinds
 *  of statement, and a page that sets them in the same type is lying by
 *  layout. */
function Why({ from, text, source }: { from: string; text: string; source?: string | null }) {
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0' }}>
      <span style={{
        flex: 'none', minWidth: 78, fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase',
        fontWeight: 700, color: 'var(--muted)', paddingTop: 3,
      }}>{FROM_LABEL[from] ?? from}</span>
      <span style={{ minWidth: 0, fontSize: 14, lineHeight: 1.55 }}>
        {text}
        {source ? <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>{source}</span> : null}
      </span>
    </li>
  );
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * AVAILABLE IN INDIA — the review's own section, under the recommendation it
 * belongs to, drawn the way the owner's evidence-review page draws it: the
 * photograph, the brand, the strength, the review's markers, the price, and
 * one control.
 *
 * ONLY UNDER A SUPPLEMENT THIS PAGE SUPPORTS. The refused bucket never
 * reaches this component — see the header for why that asymmetry is the whole
 * safety argument.
 *
 * SELLABLE FIRST, THEN CHEAPEST. A prescription-only pack and a product with
 * no recorded price are still SHOWN, because the review found them and the
 * page's job is to say what exists — they simply carry a sentence instead of
 * a button, and they sort below the things somebody can actually buy today.
 */
function Shelf({ products, qtyOf, busy, onSet }: {
  products: StoreProduct[]; qtyOf: (id: string) => number; busy: boolean;
  onSet: (id: string, n: number) => void;
}) {
  if (products.length === 0) return null;
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
      <span className="eyebrow">Available in India</span>
      <div style={{ display: 'grid', gap: 12, marginTop: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {products.map((p) => (
          <article key={p.id} style={{ border: '1px solid var(--line-2)', borderRadius: 'var(--r-2)', padding: 12, display: 'flex', flexDirection: 'column' }}>
            <span style={{ background: 'var(--well)', borderRadius: 'var(--r-1)', overflow: 'hidden', aspectRatio: '1 / 1', display: 'block' }}>
              <Shot image={p.image} pack={p.pack} colour={p.colour} />
            </span>
            <span className="eyebrow" style={{ marginTop: 10 }}>{p.brand}</span>
            <b style={{ fontSize: 13.5, lineHeight: 1.35 }}>{p.name}</b>
            {p.strength ? <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.45 }}>{p.strength}</span> : null}
            {(p.tags ?? []).length > 0 && (
              <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                {(p.tags ?? []).slice(0, 2).map((t) => <span key={t} className="tag" style={{ fontSize: 10 }}>{t}</span>)}
              </span>
            )}
            <span style={{ fontSize: 13.5, fontWeight: 700, marginTop: 'auto', paddingTop: 8 }}>
              {typeof p.priceInr === 'number' ? rupees(p.priceInr) : <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>No single price recorded</span>}
            </span>
            {p.price ? <span className="muted" style={{ fontSize: 11 }}>{p.price}</span> : null}
            <Buy p={p} qty={qtyOf(p.id)} busy={busy} onSet={(n) => onSet(p.id, n)} />
          </article>
        ))}
      </div>
    </div>
  );
}

function Card({ r, shelf }: { r: Recommendation; shelf?: React.ReactNode }) {
  const refused = r.bucket === 'not-recommended';
  return (
    <article className="card rise" style={{ padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 17, letterSpacing: '-.02em', color: refused ? 'var(--muted)' : 'var(--ink)' }}>{r.name}</b>
        <span className="muted" style={{ fontSize: 11.5 }}>{GRADE_LABEL[r.grade]}{r.gradeFor ? ` · ${r.gradeFor}` : ''}</span>
        {r.fit && !refused ? (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)' }}>
            Personal fit <b style={{ color: 'var(--ink)' }}>{r.fit.score}</b>/100
          </span>
        ) : null}
      </div>

      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {(r.why ?? []).map((w, i) => <Why key={i} from={w.from} text={w.text} source={w.source ?? undefined} />)}
      </ul>

      {/* THE DOSE, OR THE HONEST ABSENCE OF ONE. `dose: null` is not a missing
          value to paper over with a placeholder — it is the engine saying a
          clinician sets this number, and the page says exactly that. */}
      {!refused && (
        <div style={{
          display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 12, paddingTop: 12,
          borderTop: '1px solid var(--line-2)',
        }}>
          <span>
            <span className="eyebrow">Dose</span>
            <span style={{ display: 'block', fontSize: 14 }}>
              {r.dose ?? <span className="muted">Set by your doctor — not by this app</span>}
            </span>
          </span>
          {r.form ? <span><span className="eyebrow">Form worth buying</span><span style={{ display: 'block', fontSize: 14 }}>{r.form}</span></span> : null}
          {r.upperLimit ? <span><span className="eyebrow">Upper limit</span><span style={{ display: 'block', fontSize: 14 }}>{r.upperLimit}</span></span> : null}
        </div>
      )}

      {r.testFirst && !refused ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
          A blood test belongs before the first dose here, not after it.
        </p>
      ) : null}

      {r.needsClinician ? (
        <p style={{ fontSize: 13, margin: '10px 0 0', fontWeight: 600 }}>
          ⚠︎ Take this one to your doctor before you start.
        </p>
      ) : null}

      {(r.flags ?? []).length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {(r.flags ?? []).map((f, i) => (
            <li key={i} style={{ fontSize: 13, lineHeight: 1.55, padding: '9px 11px', background: 'var(--well)', borderRadius: 'var(--r-2)' }}>
              <b style={{ textTransform: 'capitalize' }}>{f.kind === 'harm' ? 'Harm signal' : f.kind}</b> — {f.text}
              {f.source ? <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>{f.source}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {/* The shelf for THIS supplement, and only where the plan supports it —
          the parent decides, so a refused card cannot grow one by accident. */}
      {shelf}
    </article>
  );
}

export function Supplements() {
  const q = useSupplementPlan();
  const plan = q.data?.plan ?? [];
  const basis = q.data?.basis;

  /* THE SHELF, THE BAG AND THE TILL ARE THE STORE'S — read here, never
     re-derived. One catalogue, one bag, one total: a product added from this
     page is the same line the store shows and the same line /fitness/orders
     charges for. */
  const store = useStore();
  const bagQ = useBag();
  const save = useSaveBag();
  const bagLines = useMemo(() => bagQ.data?.lines ?? [], [bagQ.data]);
  const qtyOf = (id: string) => bagLines.find((l) => l.id === id)?.qty ?? 0;
  const busy = save.isPending;

  const setQty = (id: string, n: number) => {
    const next = bagLines
      .map((l) => ({ id: l.id, qty: l.id === id ? n : l.qty }))
      .filter((l) => l.qty > 0);
    if (n > 0 && !bagLines.some((l) => l.id === id)) next.push({ id, qty: n });
    save.mutate(next);
  };

  /** Products by the supplement they resolve to — sellable first, then
   *  cheapest, so what somebody can actually buy today leads the row. */
  const bySupplement = useMemo(() => {
    const m = new Map<string, StoreProduct[]>();
    for (const p of store.data?.items ?? []) {
      const list = m.get(p.supplement) ?? [];
      list.push(p);
      m.set(p.supplement, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => Number(Boolean(b.sellable)) - Number(Boolean(a.sellable))
        || (a.priceInr ?? Number.MAX_SAFE_INTEGER) - (b.priceInr ?? Number.MAX_SAFE_INTEGER));
    }
    return m;
  }, [store.data]);

  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Fitness · 07</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>Your supplement plan</h1>
          <p className="lede" style={{ marginTop: 6 }}>
            Built from your blood work, your diet, your medicines and your goal — and from an evidence
            review, not a catalogue. About a third of it is what to stop buying.
          </p>
          {/* WHAT YOU CAN BUY FROM HERE, AND WHAT YOU CANNOT — said before the
              first Add rather than discovered at the fourth card. */}
          <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6 }}>
            Everything this plan supports is buyable below, from your city wallet.
            <span className="muted"> The ones it recommends against carry no price and no button
              here — they are in <Link to="/fitness/store">the whole store</Link>, where the checkout
              asks you to read the trial first.</span>
          </p>
        </div>
      </div>

      {q.isLoading ? <Spinner label="Reading your plan…" /> : q.isError ? (
        <section className="card rise" style={{ padding: '18px 20px' }}>
          <b style={{ display: 'block', fontSize: 16 }}>We couldn’t build your plan</b>
          <p className="muted" style={{ margin: '6px 0 12px' }}>
            Nothing has changed and nothing was lost — we just couldn’t reach your health data just now.
            An empty plan here would read as “you need nothing”, which is a claim we haven’t checked.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => void q.refetch()}>Try again</button>
        </section>
      ) : (
        <>
          {/* WHAT THIS PLAN WAS BUILT FROM — first, and plainly. A plan made
              without blood work and one made with it are different objects,
              and the citizen is the one who has to be able to tell. */}
          <section className="card rise" style={{ padding: '14px 18px', marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
              <span>
                <span className="eyebrow">Blood work</span>
                <span style={{ display: 'block', fontSize: 14 }}>
                  {basis?.bloodWork?.takenOn
                    ? `Read from your test of ${basis.bloodWork.takenOn}`
                    : <Link to="/medical/blood">Not on file — a test changes most of this</Link>}
                </span>
              </span>
              <span>
                <span className="eyebrow">Medicines checked</span>
                <span style={{ display: 'block', fontSize: 14 }}>{basis?.medicines ?? 0}</span>
              </span>
              {basis?.diet ? <span><span className="eyebrow">Diet</span><span style={{ display: 'block', fontSize: 14, textTransform: 'capitalize' }}>{basis.diet}</span></span> : null}
              {basis?.goal ? <span><span className="eyebrow">Goal</span><span style={{ display: 'block', fontSize: 14, textTransform: 'capitalize' }}>{basis.goal}</span></span> : null}
            </div>
          </section>

          {BUCKETS.map((b) => {
            const items = plan.filter((r) => r.bucket === b.id);
            if (!items.length) return null;
            const refusedBucket = b.id === 'not-recommended';
            return (
              <section key={b.id} style={{ marginBottom: 26 }}>
                <div className="blk-head">
                  <h2 style={{ fontSize: 20 }}><span aria-hidden>{b.dot}</span> {b.title}</h2>
                  <span className="muted" style={{ fontSize: 12 }}>{b.blurb}</span>
                </div>
                {items.map((r) => (
                  <Card key={r.id} r={r}
                    /* NO SHELF UNDER A REFUSAL, and it is decided here rather
                       than inside the card so it cannot be turned on by a prop
                       somebody adds later. */
                    shelf={refusedBucket ? undefined : (
                      <Shelf products={bySupplement.get(r.id) ?? []} qtyOf={qtyOf} busy={busy} onSet={setQty} />
                    )} />
                ))}
                {refusedBucket && (
                  <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '4px 0 0' }}>
                    These have no price and no button here, on purpose. They are still on the
                    shelf in <Link to="/fitness/store">the store</Link> — hiding them wouldn’t stop
                    the purchase, it would only move it somewhere that never showed you the trials —
                    and the checkout there asks you to read this once before it takes any money.
                  </p>
                )}
              </section>
            );
          })}

          {/* WHAT MIRA IS WATCHING — the tests whose ABSENCE is shaping the
              plan, named before the results exist. This is the honest version
              of a dashboard: it says what would change the answer. */}
          {q.data && (q.data.watching ?? []).length > 0 && (
            <section className="card rise" style={{ padding: '16px 18px', marginBottom: 18 }}>
              <b style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>What we’re watching</b>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
                Not gaps in you — gaps in what this plan was allowed to know.
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {(q.data.watching ?? []).map((w, i) => <Why key={i} from={w.from} text={w.text} source={w.source ?? undefined} />)}
              </ul>
            </section>
          )}

          {q.data && (
            <Fold title="Where all of this came from" meta={`${q.data.source.assessed} supplements assessed`}>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>
                <b>{q.data.source.title}</b>
                {q.data.source.reviewed ? ` · reviewed ${q.data.source.reviewed}` : ''}
              </p>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
                {q.data.source.note} Dietary supplements are not pre-approved for safety or effectiveness the
                way medicines are. Every dose on this page is a published range read off that review — this
                app does not calculate a dose for you, and where one is needed it says to ask your doctor.
              </p>
            </Fold>
          )}

          {/* THE SAME BAG BAR AS THE SHELF, and the same last-block-of-the-page
              rule: you reach it by getting to the end, which is also when you
              have finished deciding. Checkout is a link; nothing is charged
              before /fitness/orders. */}
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

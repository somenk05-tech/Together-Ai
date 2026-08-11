import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBeautyProfile, useBeautyRoutine, usePlaceBeautyOrder, type ProductRoutine, type ProductRoutineStep } from '../api';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
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
 * One step: the number, the picture, what it is, and what it costs.
 *
 * The picture is `ProductShot`, shared with the market — it is hotlinked to a
 * retailer's CDN and walks primary → alternate → category mark. Two copies of
 * that fallback would have been two behaviours the day one of them was fixed.
 */
function Step({ s, qty, onAdd, onRemove }: { s: ProductRoutineStep; qty: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <li style={{ display: 'flex', gap: 13, padding: '15px 0', borderTop: '1px solid var(--line)' }}>
      <span aria-hidden
        style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 12, fontWeight: 800 }}>
        {s.order}
      </span>

      <ProductShot image={s.image} imageAlt={s.imageAlt} category={s.category} size={62} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em' }}>{s.step}</span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 13.5, color: 'var(--ink)', fontWeight: 700 }}>₹{s.priceInr}</span>
        </div>
        {/* The name links out to where it is actually sold. A routine that names
            a product you then have to go and search for is homework. */}
        <div style={{ marginTop: 1 }}>
          {s.productUrl
            ? <a href={s.productUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</a>
            : <strong style={{ fontSize: 14 }}>{s.name}</strong>}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{s.brand}{s.keyIngredient ? ` · ${s.keyIngredient}` : ''}</div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.55 }}>{s.instructions}</p>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{s.frequency}</div>

        {s.warnings.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.warnings.map((w) => (
              <li key={w} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 8, padding: '6px 10px' }}>{w}</li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 9 }}>
          {qty > 0 ? (
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

function Band({ r, bag, add, remove }: { r: ProductRoutine; bag: Record<string, number>; add: (id: string) => void; remove: (id: string) => void }) {
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
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {r.steps.map((s) => (
            <Step key={s.productId} s={s} qty={bag[s.productId] ?? 0}
              onAdd={() => add(s.productId)} onRemove={() => remove(s.productId)} />
          ))}
        </ul>
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
  const place = usePlaceBeautyOrder();
  const [bag, setBag] = useState<Record<string, number>>({});
  const [placed, setPlaced] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
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

  const items = useMemo(
    () => everyStep.filter((s) => (bag[s.productId] ?? 0) > 0)
      .map((s) => ({ id: s.productId, name: s.name, priceInr: s.priceInr, qty: bag[s.productId] })),
    [everyStep, bag],
  );
  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((n, i) => n + i.priceInr * i.qty, 0);
  const routineTotal = everyStep.reduce((n, s) => n + s.priceInr, 0);

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
  const add = (id: string) => { setBag((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 })); setPlaced(false); };
  const remove = (id: string) => setBag((b) => ({ ...b, [id]: Math.max(0, (b[id] ?? 0) - 1) }));
  const addEverything = () => {
    setBag(Object.fromEntries(everyStep.map((s) => [s.productId, Math.max(1, bag[s.productId] ?? 0)])));
    setPlaced(false);
  };

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
          with a list on it, it is a sheet with a title. `routine-display` is
          the display serif, granted by name in relief.spec — the third and
          last thing in the city allowed to borrow the press's face. */}
      <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)', marginBottom: 16, padding: '22px 22px 20px' }}>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 210 }}>
            <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase' }}>Your daily</div>
            <h1 className="routine-display" style={{ fontSize: 'clamp(34px, 4.6vw, 50px)', lineHeight: 1.02, margin: '4px 0 2px', color: 'var(--accent-ink)' }}>
              AM &amp; PM
            </h1>
            <div className="routine-display" style={{ fontSize: 'clamp(19px, 2.2vw, 25px)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
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
              <div className="muted" style={{ fontSize: 11, marginBottom: 9 }}>{everyStep.length} products</div>
              <Button variant="accent" size="sm" onClick={addEverything}>Add all to bag</Button>
            </div>
          )}
        </div>

        <p className="muted" style={{ fontSize: 12, margin: '16px 0 0', lineHeight: 1.55 }}>
          Built from your saved skin and hair profile — what to use, in what order, and when.
          Anything you’ve told us you react to is left out.
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
          {/* AM and PM abreast, as in the reference; the divider between them is
              the only rule on the page and it is what makes them read as two
              halves of one day rather than two lists. */}
          <div className="card routine-day" style={{ marginBottom: 14 }}>
            {day.map((r) => <Band key={r.timeOfDay} r={r} bag={bag} add={add} remove={remove} />)}
          </div>

          {rest.filter((r) => r.steps.length > 0).map((r) => (
            <div key={r.timeOfDay} className="card" style={{ marginBottom: 14 }}>
              <Band r={r} bag={bag} add={add} remove={remove} />
            </div>
          ))}

          <div className="routine-assure card" style={{ marginBottom: 14 }}>
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

      {items.length > 0 && (
        <div className="card" style={{ position: 'sticky', bottom: 16, marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{count} item{count === 1 ? '' : 's'} · {rupees(total)}</div>
            <div className="muted" style={{ fontSize: 12 }}>{items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {placed
              ? <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-ink)' }}>✓ Paid</span>
              : <Button variant="accent" onClick={() => setPayOpen(true)}>Checkout · {rupees(total)}</Button>}
          </div>
        </div>
      )}

      <PaymentSheet
        open={payOpen}
        amountInr={total}
        label={`Beauty routine · ${count} item${count === 1 ? '' : 's'}`}
        pending={place.isPending}
        error={place.isError ? payError(place.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => place.mutate({ items, method }, { onSuccess: () => { setPlaced(true); setBag({}); setPayOpen(false); } })}
      />
    </div>
  );
}

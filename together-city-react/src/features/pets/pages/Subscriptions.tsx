/**
 * ── NEVER RUN OUT ───────────────────────────────────────────────────────────
 *
 * The countdown, its arithmetic on show, and the honest gap where the retailer
 * did not publish the energy density. See `engine/subscription.ts` — this page
 * is the engine wearing a face.
 */

import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { SectionTitle } from './PetsHome';
import { rupees } from '../engine/format';
import { useProductsByIds } from '../api';
import { usePets } from '../store';
import { CADENCES, SUBSCRIBE_SAVE_NOTE, runOut } from '../engine/subscription';
import { shortName } from '../engine/naming';

export function Subscriptions() {
  const nav = useNavigate();
  const subs = usePets((s) => s.subscriptions);
  const unsubscribe = usePets((s) => s.unsubscribe);
  const subscribe = usePets((s) => s.subscribe);
  const plans = usePets((s) => s.plans);
  const activePetId = usePets((s) => s.activePetId);
  const { data: products } = useProductsByIds(subs.map((s) => s.productId));
  const plan = activePetId ? plans[activePetId] ?? null : null;

  if (!subs.length) {
    return <Empty glyph="🔁" title="No repeat deliveries yet" line="Pick a cadence on any food, litter or supplement page and it appears here with a run-out date." action={<button type="button" className="btn" onClick={() => nav('/pets/shop')}>Browse the shop</button>} />;
  }

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 820 }}>
      <SectionTitle title="Never run out" line="Estimated from pack size and this pet’s daily amount — not from an average customer." />

      {subs.map((sub) => {
        const product = products.find((p) => p.id === sub.productId);
        if (!product) return null;
        const info = runOut(product, 0, plan);
        return (
          <article key={sub.productId} className="card" style={{ padding: 18, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <span className="muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{product.brand}</span>
                <button type="button" onClick={() => nav(`/pets/shop/${product.id}`)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 15.5, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>
                  {shortName(product)}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  {product.packSizes[0] ?? 'pack size not stated'} · {product.priceFrom ? rupees(product.priceFrom) : 'price not verified'}
                </span>
              </div>
              <button type="button" className="btn btn-sm btn-line" onClick={() => unsubscribe(sub.productId)}>Cancel</button>
            </div>

            {info.unknownReason ? (
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, padding: '10px 13px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
                {info.unknownReason}
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--wash)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(6, Math.min(100, ((info.daysLeft ?? 0) / 60) * 100))}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
                  About <strong>{info.daysLeft} days</strong> left at {info.gramsPerDay} g a day — runs out around {info.runsOut}.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {CADENCES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => subscribe(sub.productId, c.key)}
                  aria-pressed={sub.cadence === c.key}
                  style={{
                    font: 'inherit', fontSize: 12, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${sub.cadence === c.key ? 'var(--accent-line)' : 'var(--line)'}`,
                    background: sub.cadence === c.key ? 'var(--accent-soft)' : 'var(--card)',
                    color: sub.cadence === c.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
                    fontWeight: sub.cadence === c.key ? 700 : 500,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </article>
        );
      })}

      <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>{SUBSCRIBE_SAVE_NOTE}</p>
    </div>
  );
}

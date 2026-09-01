import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useGemCart, useGemCheckout, useUnlockGem } from '../hooks';
import { AstroHeader, NeedsProfileCard } from '../shared';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';

/**
 * Checkout — the locked commissions, in the shape a shop checkout has.
 *
 * THE OWNER ASKED FOR A SHOPIFY CHECKOUT AND THAT IS A LAYOUT, NOT A SKIN. What
 * makes those pages work is the two-column arrangement everybody has already
 * learned: the ORDER on the left, one line per thing with its picture and its
 * price and a way to remove it, and a SUMMARY on the right that stays put while
 * you scroll — subtotal, total, one button. Nothing else on the page, no
 * navigation to wander off through, no upsell. That structure is what is
 * borrowed. The material stays the city's: no new typeface, no new palette, no
 * second design system — the thing being bought is a ₹84,000 commission from an
 * astrology hub, and it should not suddenly look like a t-shirt store.
 *
 * PRICED NOW, NEVER AT THE PRICE IT WAS LOCKED AT. Gold moves daily. The cart
 * stores choices; the server prices them on every read from the same files the
 * studio quoted from, and again at the charge. Nothing here adds anything up
 * that the server has not already added up.
 */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function GemCheckout() {
  const cart = useGemCart();
  const unlock = useUnlockGem();
  const pay = useGemCheckout();
  const [payOpen, setPayOpen] = useState(false);
  const [paid, setPaid] = useState<{ lines: number; totalInr: number } | null>(null);

  const data = cart.data;

  if (cart.isLoading) return <Spinner label="Reading your order…" />;
  if (cart.isError || !data) {
    return (
      <Card style={{ padding: '18px 22px' }}>
        <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
          We couldn’t read your order just now. Nothing has been charged.{' '}
          <Link to="/astrology/gemstones">Back to your gemstones</Link>.
        </p>
      </Card>
    );
  }
  if ('needsProfile' in data && data.needsProfile) return <NeedsProfileCard />;

  if (paid) {
    return (
      <div>
        <AstroHeader title="Ordered" lede="Paid from your city wallet." />
        <Card style={{ padding: '22px 24px', maxWidth: 560 }}>
          <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
            {paid.lines === 1 ? 'Your stone is' : `All ${paid.lines} stones are`} commissioned —{' '}
            {rupees(paid.totalInr)}. The jeweller has the full specification for{' '}
            {paid.lines === 1 ? 'it' : 'each'} and will confirm before starting work.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Link to="/astrology/gemstones"><Button variant="accent" size="sm">Back to your gemstones</Button></Link>
            <Link to="/financial"><Button variant="line" size="sm">See the receipt</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  if (data.count === 0) {
    return (
      <div>
        <AstroHeader title="Checkout" lede="Stones you have locked, ready to commission." />
        <EmptyState
          icon="◇"
          title="Nothing locked yet"
          hint={data.dropped > 0 && !data.bodyKnown
            ? 'You have designs saved, but we need your body weight to size the stones before they can be priced. Add it to your profile.'
            : 'Design a stone from your gemstones page and lock it, and it will wait for you here.'}
        />
        <div style={{ textAlign: 'center' }}>
          <Link to="/astrology/gemstones"><Button variant="accent" size="sm">Go to your gemstones</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AstroHeader title="Checkout" lede="Everything you have locked, priced at today’s rates." />

      <div className="gem-checkout">
        {/* ── the order ──────────────────────────────────────────────────── */}
        <div style={{ minWidth: 0 }}>
          {data.lines.map((l) => (
            <div key={l.gemId} className="gem-order-line">
              <img className="no-case" src={l.image} alt={l.imageAlt} loading="lazy" width={72} height={72}
                style={{ width: 72, height: 72, objectFit: 'contain', mixBlendMode: 'multiply', flex: 'none' }} />
              <div className="flex-min">
                <div style={{ fontSize: 15, fontWeight: 700 }}>{l.name}</div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 3 }}>{l.spec}</div>
                {/* The two parts, because they are two things bought at two
                    different kinds of price — a stone and a weight of gold. */}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  Stone {rupees(l.stoneInr)}
                  {l.metalInr > 0 && ` · metal ${rupees(l.metalInr)}, made up`}
                </div>
                <button type="button" className="gem-unlock"
                  disabled={unlock.isPending}
                  onClick={() => unlock.mutate(l.gemId)}>Remove</button>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, minWidth: 96, textAlign: 'right' }}>{rupees(l.totalInr)}</div>
            </div>
          ))}

          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 14 }}>
            Each stone is cut to the weight your chart calls for and set to the specification above.
            Metal is priced at today’s rate; if it has moved by the time the piece is made, the
            jeweller will say so before starting.
          </p>
        </div>

        {/* ── the summary, which stays put ──────────────────────────────── */}
        <aside>
          <Card className="gem-summary">
            <h2 style={{ fontSize: 13, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '.12em' }}>Order summary</h2>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '9px 12px', margin: 0 }}>
              <dt className="muted" style={{ fontSize: 13 }}>Stones ({data.count})</dt>
              <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, textAlign: 'right' }}>{rupees(data.stoneInr)}</dd>
              {data.metalInr > 0 && (
                <>
                  <dt className="muted" style={{ fontSize: 13 }}>Metal, made up</dt>
                  <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, textAlign: 'right' }}>{rupees(data.metalInr)}</dd>
                </>
              )}
            </dl>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Total</span>
              <span style={{ marginLeft: 'auto', fontSize: 26, fontWeight: 800, letterSpacing: '-.01em' }}>{rupees(data.totalInr)}</span>
            </div>

            <div style={{ marginTop: 16 }}>
              <Button variant="accent" onClick={() => setPayOpen(true)}>Pay from your city wallet</Button>
            </div>
            {pay.isError && (
              <p style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600, margin: '10px 0 0' }}>{payError(pay.error)}</p>
            )}
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: '12px 0 0' }}>
              One charge for everything above. Nothing is taken until you confirm it.
            </p>
            <Link to="/astrology/gemstones" style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 700, marginTop: 12 }}>
              ← Keep looking
            </Link>
          </Card>
        </aside>
      </div>

      <PaymentSheet
        open={payOpen}
        amountInr={data.totalInr}
        label={`Gemstones · ${data.count} commission${data.count === 1 ? '' : 's'}`}
        pending={pay.isPending}
        error={pay.isError ? payError(pay.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => pay.mutate(method, {
          onSuccess: (r) => { setPaid({ lines: r.lines, totalInr: r.totalInr }); setPayOpen(false); },
        })}
      />
    </div>
  );
}

import { Link, useParams } from 'react-router-dom';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { inr, onDay, usePayout } from '../api';
import { StatusChip } from '../InvoiceBits';

/**
 * ONE PAYOUT, WITH ITS ARITHMETIC SHOWN.
 *
 * §17 of the brief: gross in, fees out, refunds adjusted, this is what reaches
 * your bank. A business shown only a net figure has to take it on trust, and
 * "trust us, it is ₹4,732" is the sentence that ends a merchant relationship.
 *
 * The destination is the account as it was AT THE TIME OF TRANSFER, copied onto
 * the row rather than joined on read — a receipt that changes which account it
 * names when the owner updates their details is not a receipt.
 */
export function PayoutView() {
  const { id: listingId, payoutId } = useParams<{ id: string; payoutId: string }>();
  const q = usePayout(payoutId);

  if (q.isLoading) return <Spinner label="Opening the payout…" />;
  if (q.isError || !q.data) {
    return (
      <div>
        <div className="eyebrow">Local Services · Payout</div>
        <EmptyState
          icon="⚠️"
          title="Couldn’t open this payout"
          hint="Nothing has changed. It may not be yours, or we couldn’t read it just now."
          action={<Link to={`/services/${listingId}/payments`} style={{ color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13.5 }}>Back to payouts →</Link>}
        />
      </div>
    );
  }

  const s = q.data;

  return (
    <div>
      <div className="eyebrow">Local Services · Payout</div>

      <Card style={{ display: 'grid', gap: 4, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 26, margin: 0 }}>{inr(s.netInr)}</h1>
          <StatusChip status={s.status} label={s.statusLabel} />
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {s.reference} · {s.status === 'settled' && s.settledAt ? `settled ${onDay(s.settledAt)}` : `expected ${onDay(s.on)}`}
          {s.destinationLast4 && ` · to •••• ${s.destinationLast4}`}
        </div>

        {s.failureReason && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)' }}>
            <p style={{ fontSize: 13, margin: 0, color: 'var(--danger-ink)', fontWeight: 600 }}>{s.failureReason}</p>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              The money has not gone anywhere. Correct the account and it goes out with the next payout.
            </p>
            <div style={{ marginTop: 8 }}>
              <Link to={`/services/${listingId}/payouts`} style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 700 }}>
                Fix payout details →
              </Link>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'grid', gap: 3, fontSize: 13.5 }}>
          <Row label="Gross taken from customers" value={s.grossInr} />
          <Row label="Together City fee" value={s.feeInr} negative />
          <Row label="GST on the fee" value={s.taxInr} negative />
          {s.adjustInr > 0 && <Row label="Refunds carried in" value={s.adjustInr} negative />}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 10, fontSize: 17, fontWeight: 800 }}>
            <span>Paid to you</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(s.netInr)}</span>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div className="eyebrow">Invoices in this payout</div>
        {s.items.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            Nothing has been banked into this payout yet. It fills as invoices are paid.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th scope="col" style={{ textAlign: 'left', padding: '0 0 6px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Invoice</th>
                <th scope="col" style={{ textAlign: 'right', padding: '0 0 6px 10px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Gross</th>
                <th scope="col" style={{ textAlign: 'right', padding: '0 0 6px 10px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Net</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '9px 0' }}>
                    <Link to={`/financial/invoices/${it.invoiceId}`} style={{ color: 'var(--accent-ink)', fontWeight: 600, textDecoration: 'none' }}>
                      {it.invoiceNumber}
                    </Link>
                  </td>
                  <td style={{ padding: '9px 0 9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(it.grossInr)}</td>
                  <td style={{ padding: '9px 0 9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(it.netInr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Link to={`/services/${listingId}/payments`} style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>
          ← Back to payments and payouts
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="muted">{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{negative ? '−' : ''}{inr(value)}</span>
    </div>
  );
}

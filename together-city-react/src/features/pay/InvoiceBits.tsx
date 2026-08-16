import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { inr, onDay, STATUS_INK, type InvoiceLine, type InvoiceSummary } from './api';

/**
 * THE PIECES BOTH SIDES SHARE.
 *
 * A status chip, a line-item table and a compact invoice card. They live here
 * rather than in each page because a business and a citizen looking at the same
 * invoice must be looking at the same document — a second copy of the totals
 * block is how the two of them end up disagreeing about ₹4,850.
 */

/** The pill shape this hub already uses, wearing a status colour. */
export function StatusChip({ status, label }: { status: string; label: string }) {
  const ink = STATUS_INK[status] ?? { ink: 'var(--muted)', soft: 'transparent' };
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
      borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
      color: ink.ink, background: ink.soft, border: `1px solid ${ink.soft === 'transparent' ? 'var(--line)' : ink.ink}`,
    }}>{label}</span>
  );
}

/**
 * THE LINES, AS A TABLE.
 *
 * A real `<table>` and not a grid of divs: it is tabular data, somebody may
 * read it with a screen reader, and the column headers are the only thing that
 * makes "1" and "1,500" mean anything.
 */
export function InvoiceLines({ items }: { items: InvoiceLine[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
          <th scope="col" style={{ textAlign: 'left', padding: '0 0 6px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Item</th>
          <th scope="col" style={{ textAlign: 'right', padding: '0 0 6px 10px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Qty</th>
          <th scope="col" style={{ textAlign: 'right', padding: '0 0 6px 10px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id} style={{ borderBottom: '1px solid var(--line)' }}>
            <td style={{ padding: '9px 0' }}>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
              {it.description && <div className="muted" style={{ fontSize: 12 }}>{it.description}</div>}
            </td>
            <td style={{ padding: '9px 0 9px 10px', textAlign: 'right', verticalAlign: 'top' }}>{it.qty}</td>
            <td style={{ padding: '9px 0 9px 10px', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>{inr(it.amountInr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One row of the totals block. The total itself is drawn heavier by `strong`. */
function Total({ label, value, strong, negative }: { label: string; value: number; strong?: boolean; negative?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 16,
      padding: strong ? '10px 0 0' : '3px 0',
      borderTop: strong ? '1px solid var(--line)' : undefined,
      marginTop: strong ? 6 : 0,
      fontSize: strong ? 17 : 13,
      fontWeight: strong ? 800 : 500,
    }}>
      <span className={strong ? undefined : 'muted'}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{negative ? '−' : ''}{inr(value)}</span>
    </div>
  );
}

/** Subtotal, discount, tax, extras, total. Rows that are zero are not drawn. */
export function InvoiceTotals({ inv }: { inv: InvoiceSummary }) {
  return (
    <div style={{ marginTop: 12 }}>
      <Total label="Subtotal" value={inv.subtotalInr} />
      {inv.discountInr > 0 && <Total label="Discount" value={inv.discountInr} negative />}
      {inv.taxInr > 0 && <Total label="Tax" value={inv.taxInr} />}
      {inv.extraInr > 0 && <Total label="Additional charges" value={inv.extraInr} />}
      <Total label="Total" value={inv.totalInr} strong />
      {inv.paidInr > 0 && inv.paidInr < inv.totalInr && (
        <>
          <Total label="Paid so far" value={inv.paidInr} />
          <Total label="Still owed" value={inv.outstandingInr} />
        </>
      )}
      {inv.refundedInr > 0 && <Total label="Refunded" value={inv.refundedInr} negative />}
    </div>
  );
}

/**
 * THE INVOICE AS ONE LINE IN A LIST — and as the card that appears in a
 * conversation.
 *
 * The same component both places, because they are the same object seen from
 * the same distance: who, how much, what state, and the way in. A separate
 * chat-only card would drift from the list within a month.
 */
export function InvoiceCard({ inv, who, onPay }: {
  inv: InvoiceSummary;
  /** The other party's name — the business to a citizen, the customer to a business. */
  who: string;
  /** Given only where paying from here makes sense. */
  onPay?: () => void;
}) {
  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px',
      display: 'grid', gap: 8, background: 'var(--card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{who}</strong>
        <StatusChip status={inv.status} label={inv.statusLabel} />
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{inv.number}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>{inr(inv.totalInr)}</span>
        {inv.dueOn && inv.payable && (
          <span className="muted" style={{ fontSize: 12 }}>Due {onDay(inv.dueOn)}</span>
        )}
        {inv.paidInr > 0 && inv.outstandingInr > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>{inr(inv.outstandingInr)} still owed</span>
        )}
      </div>
      {inv.cancelReason && (
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{inv.cancelReason}</p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to={`/financial/invoices/${inv.id}`}>
          <Button variant="line" size="sm">View invoice</Button>
        </Link>
        {onPay && inv.payable && (
          <Button variant="accent" size="sm" onClick={onPay}>Pay {inr(inv.outstandingInr)}</Button>
        )}
      </div>
    </div>
  );
}

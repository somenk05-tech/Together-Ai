import { Link } from 'react-router-dom';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { useMyInvoices, inr } from '../api';
import { InvoiceCard } from '../InvoiceBits';

/**
 * BILLS ADDRESSED TO ME.
 *
 * The unpaid ones first and the rest below, because a list of invoices is only
 * ever opened for one reason. Drafts a business has not sent never appear here
 * — they are somebody's private working-out.
 */
export function Invoices() {
  const q = useMyInvoices();

  if (q.isLoading) return <Spinner label="Looking for your invoices…" />;
  if (q.isError) {
    return (
      <div>
        <div className="eyebrow">Financial · Invoices</div>
        <h1 style={{ fontSize: 26 }}>Invoices</h1>
        <EmptyState
          icon="⚠️"
          title="Couldn’t load your invoices"
          hint="Nothing has changed and nothing has been paid — we simply couldn’t read the list just now."
        />
      </div>
    );
  }

  const rows = q.data?.items ?? [];
  const owed = rows.filter((i) => i.payable);
  const done = rows.filter((i) => !i.payable);

  return (
    <div>
      <div className="eyebrow">Financial · Invoices</div>
      <h1 style={{ fontSize: 26 }}>Invoices</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '62ch' }}>
        Bills from businesses you have talked to in Local Services. Pay from your wallet, a card,
        or both at once.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to pay"
          hint="When a business you have messaged sends you an invoice, it arrives here and in your conversation with them."
          action={<Link to="/services/browse" style={{ color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13.5 }}>Find a business →</Link>}
        />
      ) : (
        <>
          {owed.length > 0 && (
            <Card style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {owed.length === 1 ? 'One invoice waiting' : `${owed.length} invoices waiting`}
              </span>
              <strong style={{ fontSize: 22, marginLeft: 'auto' }}>{inr(q.data?.dueInr ?? 0)}</strong>
            </Card>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {owed.map((i) => (
              <InvoiceCard key={i.id} inv={i} who={i.businessName ?? 'A business'} />
            ))}
          </div>

          {done.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--line)', margin: '20px 0 12px', paddingTop: 12 }}>
                <strong style={{ fontSize: 13.5 }}>Settled and closed</strong>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {done.map((i) => (
                  <InvoiceCard key={i.id} inv={i} who={i.businessName ?? 'A business'} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

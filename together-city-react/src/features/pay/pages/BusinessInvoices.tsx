import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { inr, onDay, useBusinessInvoices } from '../api';
import { StatusChip } from '../InvoiceBits';

/**
 * EVERY INVOICE THIS BUSINESS HAS WRITTEN.
 *
 * The tabs are the brief's list of states, and the counts beside them are of
 * EVERYTHING rather than of the filtered view — a tab reading "Overdue" beside
 * a zero it computed from its own rows would always read zero.
 *
 * `overdue` and `paid` are not stored anywhere; the server works them out from
 * what has happened and what day it is. That is why the filter is a query
 * parameter rather than a database column, and it is why an invoice can move
 * from Sent to Overdue overnight with nothing having run.
 */
const TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'sent', label: 'Sent' },
  { key: 'viewed', label: 'Seen' },
  { key: 'part_paid', label: 'Part paid' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
];

export function BusinessInvoices() {
  const { id: listingId } = useParams<{ id: string }>();
  const [tab, setTab] = useState('all');
  const q = useBusinessInvoices(listingId, tab);

  if (q.isLoading) return <Spinner label="Loading your invoices…" />;
  if (q.isError) {
    return (
      <div>
        <div className="eyebrow">Local Services · Invoices</div>
        <h1 style={{ fontSize: 26 }}>Invoices</h1>
        <EmptyState
          icon="⚠️"
          title="Couldn’t load your invoices"
          hint="Nothing has been sent or cancelled — we simply couldn’t read the list just now."
        />
      </div>
    );
  }

  const rows = q.data?.items ?? [];
  const counts = q.data?.counts ?? {};

  return (
    <div>
      <div className="eyebrow">Local Services · Invoices</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Invoices</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to={`/services/${listingId}/payments`}><Button variant="line" size="sm">Payments &amp; payouts</Button></Link>
          <Link to={`/services/${listingId}/invoices/new`}><Button variant="accent" size="sm">＋ New invoice</Button></Link>
        </div>
      </div>

      <nav aria-label="Filter invoices by state" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '14px 0 12px', paddingBottom: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            style={{
              minHeight: 44, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
              padding: '0 12px', borderRadius: 'var(--r-full)', fontSize: 12.5, fontWeight: 600,
              border: `1px solid ${tab === t.key ? 'var(--accent)' : 'var(--line)'}`,
              background: tab === t.key ? 'var(--accent-soft)' : 'transparent',
              color: tab === t.key ? 'var(--accent-ink)' : 'var(--ink)',
            }}
          >
            {t.label} {counts[t.key] != null && <span className="muted">{counts[t.key]}</span>}
          </button>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={tab === 'all' ? 'You haven’t billed anybody yet' : 'Nothing in here'}
          hint={tab === 'all'
            ? 'An invoice goes to a neighbour who has messaged you and shown you their name. They can pay it from their wallet or a card.'
            : 'Try another state — the counts beside each tab are of everything you have written.'}
          action={tab === 'all'
            ? <Link to={`/services/${listingId}/invoices/new`} style={{ color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13.5 }}>Write your first invoice →</Link>
            : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((i) => (
            <Card key={i.id} lift style={{ padding: '12px 14px' }}>
              <Link to={`/financial/invoices/${i.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15 }}>{i.customerName ?? 'A neighbour'}</strong>
                  <StatusChip status={i.status} label={i.statusLabel} />
                  <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
                    {inr(i.totalInr)}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {i.number} · {onDay(i.issuedAt)}
                  {i.dueOn && <> · due {onDay(i.dueOn)}</>}
                  {i.paidInr > 0 && i.outstandingInr > 0 && <> · {inr(i.outstandingInr)} still owed</>}
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Fold, Spinner } from '@/components/ui';
import { inr, onDay, useMerchantDashboard, useOnboarding } from '../api';
import { StatusChip } from '../InvoiceBits';

/**
 * PAYMENTS & PAYOUTS.
 *
 * Four figures at the top, and the distinction between the first two is the
 * whole point of the screen: what has reached the bank, and what has been
 * earned and has not. A single "balance" would collapse the two events the
 * settlement system exists to keep apart.
 *
 * Every number here is summed from the ledger on read rather than stored. A
 * cached balance is a second source of truth, and the first time it disagrees
 * with the rows beneath it, the thing in dispute is somebody's money.
 */
export function BusinessPayments() {
  const { id: listingId } = useParams<{ id: string }>();
  const q = useMerchantDashboard(listingId);
  const onboarding = useOnboarding(listingId);

  if (q.isLoading) return <Spinner label="Adding up your book…" />;
  if (q.isError || !q.data) {
    return (
      <div>
        <div className="eyebrow">Local Services · Payments</div>
        <h1 style={{ fontSize: 26 }}>Payments &amp; payouts</h1>
        <EmptyState
          icon="⚠️"
          title="Couldn’t load your payments"
          hint="Nothing has moved and no payout has changed. We simply couldn’t read your book just now."
        />
      </div>
    );
  }

  const d = q.data;
  const state = onboarding.data;

  return (
    <div>
      <div className="eyebrow">Local Services · Payments</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Payments &amp; payouts</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to={`/services/${listingId}/invoices`}><Button variant="line" size="sm">Invoices</Button></Link>
          <Link to={`/services/${listingId}/invoices/new`}><Button variant="accent" size="sm">＋ New invoice</Button></Link>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px', maxWidth: '62ch' }}>
        {d.businessName}. Money a customer pays today reaches your account on the next working day.
      </p>

      {/* THE ONBOARDING BANNER, and it is only drawn when something is
          actually needed. A permanent "set up payouts" strip on a verified
          business is a strip people stop reading. */}
      {state && state.stage !== 'payouts_enabled' && (
        <Card style={{ marginBottom: 14, borderLeft: '3px solid var(--warn-ink)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>
              {state.stage === 'under_review' ? 'We are checking your account'
                : state.stage === 'payouts_on_hold' ? 'Payouts are on hold'
                : state.stage === 'verified' ? 'Almost there'
                : 'Complete business verification'}
            </strong>
            <Link to={`/services/${listingId}/payouts`} style={{ marginLeft: 'auto' }}>
              <Button variant="accent" size="sm">
                {state.account ? 'Manage account' : 'Add payout account'}
              </Button>
            </Link>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>{state.next}</p>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <Figure label="Settled" value={d.settledInr} note="Already in your account" />
        <Figure label="Pending settlement" value={d.pendingInr} note="Earned, on its way" />
        <Figure label="Today's sales" value={d.todayInr} note="Paid to you today" />
        <Figure label="Total sales" value={d.totalSalesInr} note="Since you started" />
      </div>

      {d.nextPayout && (
        <Card style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">Next payout</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>{inr(d.nextPayout.amountInr)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>Expected {onDay(d.nextPayout.on)}</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <StatusChip status={d.nextPayout.status} label={d.nextPayout.statusLabel} />
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <div className="eyebrow">Payout account</div>
        {d.account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.account.legalName}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {d.account.bankName ? `${d.account.bankName} · ` : ''}•••• {d.account.last4 ?? '————'}
              </div>
            </div>
            <StatusChip
              status={d.account.payoutsEnabled ? 'settled' : d.account.status === 'rejected' ? 'failed' : 'pending'}
              label={d.account.payoutsEnabled ? 'Verified' : d.account.status === 'rejected' ? 'Not accepted' : 'Under review'}
            />
            <Link to={`/services/${listingId}/payouts`}><Button variant="line" size="sm">Manage account</Button></Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 13, flex: 1 }}>
              No account yet. Money from your invoices is being held until you add one — none of it is lost.
            </span>
            <Link to={`/services/${listingId}/payouts`}><Button variant="accent" size="sm">Add payout account</Button></Link>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div className="eyebrow">Payout history</div>
        {d.payouts.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            No payouts yet. The first one opens the day somebody pays an invoice.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {d.payouts.map((p) => (
              <Link
                key={p.id}
                to={`/services/${listingId}/payouts/${p.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '9px 0', borderTop: '1px solid var(--line)',
                  textDecoration: 'none', color: 'inherit', minHeight: 44,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 92 }}>{onDay(p.on)}</span>
                <span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{inr(p.netInr)}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{p.reference}</span>
                <span style={{ marginLeft: 'auto' }}><StatusChip status={p.status} label={p.statusLabel} /></span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Fold
        title="Everything that moved"
        meta={d.transactions.length === 0 ? 'Nothing yet' : `${d.transactions.length} entries · fees ${inr(d.feesInr)} · refunds ${inr(d.refundedInr)}`}
      >
        {d.transactions.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Your book is empty. Every sale, fee, refund and payout is written here as its own line.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {d.transactions.map((t) => (
              <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
                <span style={{ minWidth: 0, flex: 1 }}>{t.note}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{onDay(t.at)}</span>
                <span style={{
                  fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: t.amountInr < 0 ? 'var(--muted)' : 'var(--ok-ink)',
                }}>
                  {t.amountInr < 0 ? '−' : '+'}{inr(Math.abs(t.amountInr))}
                </span>
              </div>
            ))}
          </div>
        )}
      </Fold>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card style={{ padding: '12px 14px' }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 2 }}>{inr(value)}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{note}</div>
    </Card>
  );
}

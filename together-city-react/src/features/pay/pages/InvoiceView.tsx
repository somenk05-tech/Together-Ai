import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import {
  inr, onDay, payError, useCancelInvoice, useDeleteDraft, useInvoice, useRefundInvoice, useSendInvoice,
  type PaidResult,
} from '../api';
import { InvoiceLines, InvoiceTotals, StatusChip } from '../InvoiceBits';
import { PaidSheet, PayInvoiceSheet } from '../PayInvoiceSheet';

/**
 * ONE INVOICE — and the same route serves both people looking at it.
 *
 * `side` comes from the server, which already decided who is asking and shaped
 * the object accordingly. Two routes would mean two screens, and two screens
 * showing the same document is how a business and a customer end up quoting
 * different totals at each other.
 */
export function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const q = useInvoice(id);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<PaidResult | null>(null);

  if (q.isLoading) return <Spinner label="Opening the invoice…" />;
  if (q.isError || !q.data) {
    return (
      <div>
        <div className="eyebrow">Financial · Invoice</div>
        <EmptyState
          icon="⚠️"
          title="Couldn’t open this invoice"
          hint="Nothing has been paid and nothing has changed. It may not be yours, or we couldn’t read it just now."
          action={<Link to="/financial/invoices" style={{ color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13.5 }}>Back to invoices →</Link>}
        />
      </div>
    );
  }

  const inv = q.data;
  const mine = inv.side === 'customer';
  const who = mine ? (inv.businessName ?? 'A business') : (inv.customerName ?? 'A neighbour');

  return (
    <div>
      <div className="eyebrow">{mine ? 'Financial · Invoice' : 'Local Services · Invoice'}</div>

      <Card style={{ display: 'grid', gap: 4, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>{who}</h1>
          <StatusChip status={inv.status} label={inv.statusLabel} />
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Invoice {inv.number} · issued {onDay(inv.issuedAt)}
          {inv.dueOn && <> · due {onDay(inv.dueOn)}</>}
        </div>
        {inv.businessHref && mine && (
          <div style={{ marginTop: 2 }}>
            <Link to={inv.businessHref} style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>
              See the business page →
            </Link>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <InvoiceLines items={inv.items} />
          <InvoiceTotals inv={inv} />
        </div>

        {inv.notes && (
          <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{inv.notes}</p>
        )}

        {inv.status === 'cancelled' && inv.cancelReason && (
          <p style={{ fontSize: 13, margin: '10px 0 0', color: 'var(--danger-ink)' }}>
            This invoice was cancelled. {inv.cancelReason}
          </p>
        )}

        {mine && inv.payable && (
          <div style={{ marginTop: 14 }}>
            <Button variant="accent" onClick={() => setPayOpen(true)} style={{ width: '100%' }}>
              Pay {inr(inv.outstandingInr)}
            </Button>
            <p className="muted" style={{ fontSize: 11, margin: '8px 0 0', textAlign: 'center' }}>
              Wallet, card, or both. Nothing moves until you confirm.
            </p>
          </div>
        )}

        {mine && inv.status === 'paid' && (
          <p style={{ fontSize: 13, margin: '12px 0 0', color: 'var(--ok-ink)', fontWeight: 700 }}>
            Paid in full{inv.paidAt ? ` on ${onDay(inv.paidAt)}` : ''}.
          </p>
        )}
      </Card>

      <PaymentHistory inv={inv} />

      {!mine && <BusinessActions inv={inv} />}

      <PayInvoiceSheet
        invoice={inv}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onPaid={(r) => { setPayOpen(false); setReceipt(r); }}
      />
      {receipt && (
        <PaidSheet
          result={receipt}
          businessName={inv.businessName ?? 'this business'}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}

/**
 * EVERY ATTEMPT, INCLUDING THE ONES THAT FAILED.
 *
 * A citizen whose card was refused at 11:04 and who paid at 11:06 has two rows
 * here. Showing only the success is what makes a support conversation take an
 * afternoon — the failed attempt is the thing they are ringing about.
 */
function PaymentHistory({ inv }: { inv: ReturnType<typeof useInvoice>['data'] & object }) {
  if (inv.payments.length === 0) return null;
  return (
    <Card style={{ marginTop: 12 }}>
      <div className="eyebrow">Payment history</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {inv.payments.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13 }}>
            <StatusChip
              status={p.status === 'succeeded' ? 'paid' : p.status === 'failed' ? 'overdue' : 'pending'}
              label={p.status === 'succeeded' ? 'Paid' : p.status === 'failed' ? 'Failed' : 'Pending'}
            />
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{inr(p.amountInr)}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {p.walletInr > 0 && `wallet ${inr(p.walletInr)}`}
              {p.walletInr > 0 && p.cardInr > 0 && ' · '}
              {p.cardInr > 0 && `card ${inr(p.cardInr)}`}
            </span>
            <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
              {p.transactionRef ?? onDay(p.at)}
            </span>
            {p.failureMessage && (
              <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--danger-ink)' }}>{p.failureMessage}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * WHAT THE BUSINESS CAN DO TO ITS OWN INVOICE — and it is a short list, because
 * a document somebody has been sent is not a form.
 *
 * Send while it is a draft. Cancel while nothing has been paid. Refund once
 * something has. Each of those is a different act with a different record, and
 * the screen never offers two of them at once.
 */
function BusinessActions({ inv }: { inv: ReturnType<typeof useInvoice>['data'] & object }) {
  const nav = useNavigate();
  const send = useSendInvoice();
  const cancel = useCancelInvoice();
  const refund = useRefundInvoice();
  const removeDraft = useDeleteDraft();
  const [mode, setMode] = useState<'none' | 'cancel' | 'refund'>('none');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const field = {
    padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10,
    fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)',
    width: '100%', boxSizing: 'border-box' as const,
  };
  const refundable = inv.paidInr - inv.refundedInr;
  const fail = (fallback: string) => (e: unknown) => setErr(payError(e, fallback));

  return (
    <Card style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <div className="eyebrow">This invoice</div>

      {err && <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }}>{err}</p>}

      {mode === 'none' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {inv.status === 'draft' && (
            <Button
              variant="accent" size="sm" disabled={send.isPending || inv.totalInr <= 0}
              onClick={() => { setErr(null); send.mutate(inv.id, { onError: fail('That invoice could not be sent.') }); }}
            >
              {send.isPending ? 'Sending…' : 'Send invoice'}
            </Button>
          )}
          {inv.paidInr === 0 && inv.status !== 'cancelled' && (
            <Button variant="line" size="sm" onClick={() => { setMode('cancel'); setErr(null); }}>Cancel invoice</Button>
          )}
          {refundable > 0 && (
            <Button variant="line" size="sm" onClick={() => { setMode('refund'); setAmount(String(refundable)); setErr(null); }}>
              Refund
            </Button>
          )}
          <Link to={`/services/${inv.listingId}/invoices`}>
            <Button variant="line" size="sm">All invoices</Button>
          </Link>
          {/* ONLY A DRAFT. Anything sent is a document the other person is
              holding, and deleting one of those is not tidying up. */}
          {inv.status === 'draft' && (
            <Button
              variant="line" size="sm" disabled={removeDraft.isPending}
              onClick={() => removeDraft.mutate(inv.id, {
                onSuccess: () => nav(`/services/${inv.listingId}/invoices`),
                onError: fail('That draft could not be deleted.'),
              })}
            >
              {removeDraft.isPending ? 'Deleting…' : 'Delete draft'}
            </Button>
          )}
        </div>
      )}

      {mode === 'cancel' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12.5 }}>
            <span className="muted">Why — the person you billed reads this</span>
            <input
              style={field} value={reason} maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Job did not go ahead"
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="line" size="sm" onClick={() => setMode('none')}>Keep it</Button>
            <Button
              variant="accent" size="sm" disabled={reason.trim().length < 3 || cancel.isPending}
              onClick={() => cancel.mutate(
                { id: inv.id, reason: reason.trim() },
                { onSuccess: () => setMode('none'), onError: fail('That invoice could not be cancelled.') },
              )}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel it'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'refund' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            {inr(refundable)} of this invoice can still be refunded. It goes straight back into their
            Together City wallet, and comes out of your next payout.
          </p>
          <label style={{ fontSize: 12.5 }}>
            <span className="muted">Amount in rupees</span>
            <input
              style={field} type="number" min={1} max={refundable} value={amount}
              onChange={(e) => setAmount(e.target.value)} aria-label="Refund amount in rupees"
            />
          </label>
          <label style={{ fontSize: 12.5 }}>
            <span className="muted">Why</span>
            <input
              style={field} value={reason} maxLength={300}
              onChange={(e) => setReason(e.target.value)} placeholder="Overcharged for products"
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="line" size="sm" onClick={() => setMode('none')}>Never mind</Button>
            <Button
              variant="accent" size="sm"
              disabled={refund.isPending || reason.trim().length < 3 || Number(amount) <= 0 || Number(amount) > refundable}
              onClick={() => refund.mutate(
                { id: inv.id, amountInr: Number(amount), reason: reason.trim() },
                { onSuccess: () => setMode('none'), onError: fail('That refund did not go through.') },
              )}
            >
              {refund.isPending ? 'Refunding…' : `Refund ${inr(Number(amount) || 0)}`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

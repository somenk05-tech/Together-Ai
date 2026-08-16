import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { inr, useInvoice, type PaidResult } from './api';
import { StatusChip } from './InvoiceBits';
import { PaidSheet, PayInvoiceSheet } from './PayInvoiceSheet';

/**
 * AN INVOICE, IN THE CONVERSATION IT BELONGS TO.
 *
 * ── Why the thread and not the chat hub ────────────────────────────────────
 *
 * Local Services keeps its conversations out of `/chats` deliberately: the
 * business is talking to `#7` until `#7` says otherwise, and routing a bill
 * through the chat hub would carry a citizen's name into the one place this hub
 * promises it does not go. So the bill lands where the job was agreed, which is
 * also the only room both people are already in.
 *
 * ── It degrades to a sentence ──────────────────────────────────────────────
 *
 * `body` is rendered while the invoice loads and if it cannot be read at all.
 * The server writes a real sentence onto every one of these rows for exactly
 * that reason — a card that fails should look like a message, never like a
 * blank bubble somebody has to guess at.
 *
 * ── Pay happens here ───────────────────────────────────────────────────────
 *
 * The same sheet as the invoice screen, not a second one. A payment surface
 * that exists twice is a split-funding bug waiting for the copy to drift.
 */
export function ThreadInvoice({ invoiceId, body, at }: { invoiceId: string; body: string; at: string }) {
  const q = useInvoice(invoiceId);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<PaidResult | null>(null);

  const shell = (children: React.ReactNode) => (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 14, padding: '11px 13px',
      background: 'var(--card)', display: 'grid', gap: 7,
    }}>
      {children}
      <span className="muted" style={{ fontSize: 10.5 }}>{at}</span>
    </div>
  );

  // Loading, or a read that failed. Either way the sentence is the truth we
  // still have, so it is what gets shown.
  if (q.isLoading || q.isError || !q.data) {
    return shell(
      <>
        <span style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{body}</span>
        <Link to={`/financial/invoices/${invoiceId}`} style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 700 }}>
          Open the invoice →
        </Link>
      </>,
    );
  }

  const inv = q.data;
  const mine = inv.side === 'customer';

  return (
    <>
      {shell(
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13.5 }}>{mine ? (inv.businessName ?? 'Invoice') : (inv.customerName ?? 'Invoice')}</strong>
            <StatusChip status={inv.status} label={inv.statusLabel} />
            <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{inv.number}</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>{inr(inv.totalInr)}</div>
          {inv.status === 'paid' && (
            <div style={{ fontSize: 12.5, color: 'var(--ok-ink)', fontWeight: 700 }}>
              ✓ Paid — {inr(inv.paidInr)} received.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to={`/financial/invoices/${inv.id}`}>
              <Button variant="line" size="sm">View invoice</Button>
            </Link>
            {mine && inv.payable && (
              <Button variant="accent" size="sm" onClick={() => setPayOpen(true)}>
                Pay {inr(inv.outstandingInr)}
              </Button>
            )}
          </div>
        </>,
      )}

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
    </>
  );
}

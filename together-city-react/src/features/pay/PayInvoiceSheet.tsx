import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useLinkCard } from '@/features/financial/api';
import {
  inr, newPaymentKey, payError, useQuote, usePayInvoice,
  type Invoice, type PaidResult,
} from './api';

/**
 * RECEIVE → REVIEW → PAY → DONE, and this is the third step.
 *
 * ── The wallet row is a switch, not a decision made for them ───────────────
 *
 * It defaults on, because a balance somebody has already put in the city is the
 * money they expected to spend. Turning it off puts the whole thing on the
 * card, and the two rows below re-draw as one. What the sheet never does is
 * decide silently: the split is always shown as two lines with two amounts, so
 * the number leaving the wallet is never a surprise.
 *
 * ── The arithmetic comes from the server ───────────────────────────────────
 *
 * `useQuote` asks what the split would be. The sheet could compute it — it has
 * the balance and the amount — and that is exactly the second copy that ends up
 * disagreeing with the first. One function, in money.ts, on the other side of
 * the wire.
 *
 * ── One key per opening ────────────────────────────────────────────────────
 *
 * The idempotency key is minted when the sheet opens and reused for every press
 * inside it. A double tap, or a retry after the connection drops, repeats the
 * same attempt rather than starting a second one.
 *
 * ── Closing midway takes nothing ───────────────────────────────────────────
 *
 * There is no state on the server until Pay is pressed. A citizen who opens
 * this and thinks better of it has done nothing, which is why Cancel needs no
 * confirmation and no cleanup.
 */
export function PayInvoiceSheet({ invoice, open, onClose, onPaid }: {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onPaid: (result: PaidResult) => void;
}) {
  const [useWallet, setUseWallet] = useState(true);
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const quote = useQuote(invoice.id, useWallet, open);
  const pay = usePayInvoice();
  const linkCard = useLinkCard();

  useEffect(() => {
    if (open) { setKey(newPaymentKey()); setErr(null); }
  }, [open, invoice.id]);

  if (!open) return null;

  const q = quote.data;
  const due = q?.dueInr ?? invoice.outstandingInr;

  const submit = () => {
    if (!q) return;
    setErr(null);
    pay.mutate(
      { id: invoice.id, expectInr: q.dueInr, useWallet, idempotencyKey: key },
      {
        onSuccess: (result) => onPaid(result),
        onError: (e: unknown) => setErr(payError(e)),
      },
    );
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'var(--scrim-deep)', display: 'grid', placeItems: 'end center', zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Pay invoice ${invoice.number}`}
        style={{
          width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: '18px 18px 0 0',
          padding: '20px 18px 24px', boxShadow: 'var(--e3)', maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        <div className="eyebrow">Pay {invoice.businessName ?? 'this business'}</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0 0' }}>{inr(due)}</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Invoice {invoice.number}</div>

        {quote.isLoading && <Spinner label="Working out your split…" />}
        {quote.isError && (
          <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13 }}>
            We couldn’t read your balance just now. Nothing has been taken — close this and open it again.
          </p>
        )}

        {q && (
          <>
            {/* THE WALLET ROW. A switch with the balance on it, because the
                number is the whole reason somebody chooses either way. */}
            <button
              type="button"
              role="switch"
              aria-checked={useWallet}
              onClick={() => setUseWallet((v) => !v)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                borderRadius: 12, padding: '12px 14px', marginBottom: 8, minHeight: 44,
                border: `1.5px solid ${useWallet ? 'var(--accent)' : 'var(--line)'}`,
                background: useWallet ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span aria-hidden style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${useWallet ? 'var(--accent)' : 'var(--line)'}`,
                  background: useWallet ? 'var(--accent)' : 'transparent',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Together City Wallet</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    Balance {inr(q.balanceInr)}
                    {q.balanceInr === 0 && ' — nothing in it yet'}
                  </div>
                </div>
                <span style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{inr(q.walletInr)}</span>
              </div>
            </button>

            {/* THE CARD ROW. Drawn whenever a card leg exists, so the split is
                two visible lines rather than one number and an assumption. */}
            {q.cardInr > 0 && (
              q.card ? (
                <div style={{
                  borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                  border: '1.5px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span aria-hidden style={{ fontSize: 17 }}>💳</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{q.card.brand} •• {q.card.last4}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{q.card.name}</div>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{inr(q.cardInr)}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => linkCard.mutate({ brand: 'Visa', last4: '4242', name: 'City Card' })}
                  disabled={linkCard.isPending}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
                    borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                    border: '1.5px dashed var(--line)', background: 'transparent',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {linkCard.isPending ? 'Adding…' : `＋ Add a card for the remaining ${inr(q.cardInr)}`}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    Together City never sees your card number — your bank keeps it.
                  </div>
                </button>
              )
            )}

            {/* THE SUM, RESTATED. Two rows and a total is how anybody checks
                arithmetic, and it is the line the receipt repeats afterwards. */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4,
              fontSize: 14, fontWeight: 800,
            }}>
              <span>Total to pay</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(q.walletInr + q.cardInr)}</span>
            </div>

            {q.needsCard && (
              <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                Your wallet covers {inr(q.walletInr)} of this. Add a card for the rest, or{' '}
                <Link to="/financial/wallet" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>top up your wallet</Link>.
              </p>
            )}

            {err && (
              <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 12.5, fontWeight: 600, margin: '10px 0 0' }}>
                {err}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="line" onClick={onClose} disabled={pay.isPending}>Cancel</Button>
              <Button
                variant="accent"
                style={{ flex: 1 }}
                disabled={pay.isPending || q.needsCard || q.dueInr <= 0}
                onClick={submit}
              >
                {pay.isPending ? 'Paying…' : `Pay ${inr(q.dueInr)}`}
              </Button>
            </div>
            <p className="muted" style={{ fontSize: 11, margin: '10px 0 0', textAlign: 'center' }}>
              Nothing moves until you press Pay. Closing this takes nothing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * DONE.
 *
 * The brief's success screen, and the split is on it in full: what came from
 * the wallet, what came from the card, and a reference somebody can read down a
 * phone. A receipt that says only "₹4,850 paid" is a receipt that cannot settle
 * an argument.
 */
export function PaidSheet({ result, businessName, onClose }: {
  result: PaidResult; businessName: string; onClose: () => void;
}) {
  const p = result.payment;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'var(--scrim-deep)', display: 'grid', placeItems: 'end center', zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Payment successful"
        style={{
          width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: '18px 18px 0 0',
          padding: '24px 18px 24px', boxShadow: 'var(--e3)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div aria-hidden style={{
            width: 52, height: 52, borderRadius: '50%', margin: '0 auto 10px',
            background: 'var(--ok-soft)', color: 'var(--ok-ink)',
            display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 800,
          }}>✓</div>
          <h2 style={{ fontSize: 20, margin: 0 }}>Payment successful</h2>
          <p style={{ fontSize: 15, margin: '4px 0 0' }}>
            <strong>{inr(p.amountInr)}</strong> paid to {businessName}
          </p>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>Invoice {result.invoice.number}</p>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 12, display: 'grid', gap: 5, fontSize: 13 }}>
          {p.walletInr > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Wallet used</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(p.walletInr)}</span>
            </div>
          )}
          {p.cardInr > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Card used</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(p.cardInr)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Transaction</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.transactionRef}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Wallet balance now</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(result.balanceInr)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button variant="accent" style={{ flex: 1 }} onClick={onClose}>View receipt</Button>
        </div>
      </div>
    </div>
  );
}

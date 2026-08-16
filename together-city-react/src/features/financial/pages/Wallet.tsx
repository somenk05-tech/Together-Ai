import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Fold, Spinner } from '@/components/ui';
import { useWallet, useTopUp, useServices, useLinkCard, useRemoveCard, catIcon, inr, type Txn } from '../api';
import { PrivacyNote } from '@/features/privacy/PrivacyNote';
import { useMyInvoices } from '@/features/pay/api';
import { InvoiceCard } from '@/features/pay/InvoiceBits';

const TOPUPS = [500, 1000, 2000, 5000];

function TxnRow({ t }: { t: Txn }) {
  const credit = t.direction === 'credit';
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ fontSize: 20 }}>{catIcon[t.category] ?? '•'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.label}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>{t.hub} · {t.date.slice(0, 10)}</div>
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color: credit ? 'var(--ok-ink)' : 'var(--ink)' }}>{credit ? '+' : '−'}{inr(t.amountInr)}</span>
    </div>
  );
}

/** City Wallet — one balance, and everything you spend across the city. */
export function Wallet() {
  const wallet = useWallet();
  const topUp = useTopUp();
  const services = useServices();
  const linkCard = useLinkCard();
  const removeCard = useRemoveCard();
  const [amount, setAmount] = useState('');

  if (wallet.isLoading) return <Spinner label="Opening your wallet…" />;
  if (wallet.isError || !wallet.data) return <EmptyState title="Couldn't load your wallet" hint="Your balance and cards are untouched — nothing has moved. We simply couldn’t read them just now." />;
  const w = wallet.data;

  return (
    <div>
      <div className="eyebrow">Financial · Wallet</div>
      <h1 style={{ fontSize: 26 }}>Your city wallet</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px' }}>
        One balance for the whole city — top up here and pay across Nutrition, Beauty and Medical.
      </p>
      <PrivacyNote hub="financial" style={{ marginBottom: 16 }} />

      <div className="card" style={{ marginBottom: 14, background: 'linear-gradient(135deg, var(--accent) 0%, var(--danger-ink) 100%)', color: 'var(--on-accent)', border: 'none' }}>
        <div style={{ fontSize: 12, opacity: .85, textTransform: 'uppercase', letterSpacing: '.08em' }}>Balance</div>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{inr(w.balanceInr)}</div>
        <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 12.5 }}>
          <div><div style={{ opacity: .8 }}>Spent this month</div><div style={{ fontWeight: 700, fontSize: 15 }}>{inr(w.spentThisMonthInr)}</div></div>
          <div><div style={{ opacity: .8 }}>Lifetime spend</div><div style={{ fontWeight: 700, fontSize: 15 }}>{inr(w.lifetimeSpendInr)}</div></div>
        </div>
      </div>

      <WalletActions />
      <InvoicesWaiting />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Payment methods</div>
        {w.card ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <span style={{ fontSize: 22 }}>💳</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{w.card.brand} •• {w.card.last4}</div>
              <div className="muted" style={{ fontSize: 12 }}>{w.card.name}</div>
            </div>
            <Button variant="line" size="sm" disabled={removeCard.isPending} onClick={() => removeCard.mutate()}>Remove</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <span className="muted" style={{ fontSize: 13, flex: 1 }}>No card linked. Add one to pay without topping up the wallet.</span>
            <Button variant="accent" size="sm" disabled={linkCard.isPending}
              onClick={() => linkCard.mutate({ brand: 'Visa', last4: '4242', name: 'City Card' })}>
              {linkCard.isPending ? 'Linking…' : '＋ Link a card'}
            </Button>
          </div>
        )}
      </div>

      <div className="card" id="top-up" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Top up</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {TOPUPS.map((a) => (
            <Button key={a} variant="line" size="sm" disabled={topUp.isPending} onClick={() => topUp.mutate(a)}>+{inr(a)}</Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Custom amount"
            style={{ flex: 1, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          <Button variant="accent" size="sm" disabled={topUp.isPending || !amount}
            onClick={() => { const n = Number(amount); if (n > 0) topUp.mutate(n, { onSuccess: () => setAmount('') }); }}>
            {topUp.isPending ? 'Adding…' : 'Add money'}
          </Button>
        </div>
      </div>

      {/* FOLDED, AND CLOSED. This is a page about a balance and how to add to
          it; the last six transactions are a reference, not the reason anybody
          came. The meta line carries what the closed section would otherwise
          leave unsaid — how many, and how recent — because a section reading
          only "Recent activity" gives nobody a reason to open it.

          THE "SEE ALL" LINK MOVED INSIDE. It was beside the heading, and the
          heading is a <button> now: a link inside a button is a tap target
          inside a tap target, which is the thing the fold contract exists to
          avoid. It sits at the foot of the panel, where somebody who has read
          the six is the person who wants the rest. */}
      <Fold
        title="Recent activity"
        meta={w.recent.length === 0 ? 'Nothing yet'
          : `${w.recent.length} ${w.recent.length === 1 ? 'entry' : 'entries'} · latest ${w.recent[0].date.slice(0, 10)}`}
      >
        {w.recent.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>No activity yet. Top up, then pay across any hub — it all flows through here.</p>
        ) : (
          <>
            {w.recent.map((t) => <TxnRow key={t.id} t={t} />)}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Link to="/financial/transactions" style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>See all →</Link>
            </div>
          </>
        )}
      </Fold>

      <div className="card">
        <div className="eyebrow">City service rates</div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          Every hub charges this one wallet. Fixed-price services are listed here; carts (groceries, beauty) charge their own total.
        </p>
        {(services.data ?? []).map((sv) => (
          <div key={sv.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 16 }}>{catIcon[sv.category] ?? '•'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{sv.label}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{sv.note}</div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{inr(sv.amountInr)}</span>
          </div>
        ))}
        {(services.data ?? []).length === 0 && <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Rates load from the central rate card.</p>}
      </div>
    </div>
  );
}


/**
 * THE FOUR THINGS A WALLET IS FOR — and two of them are not open yet.
 *
 * Add money and Pay are real: the first is the top-up below, the second is the
 * list of invoices waiting for you. Send and Request are person-to-person
 * transfer, which is a different product with a different licence behind it, so
 * they say so rather than sitting there greyed out with no explanation.
 *
 * A CONTROL THAT DOES NOTHING IS WORSE THAN A CONTROL THAT IS NOT THERE, and
 * this hub has had that argument once already. The middle answer — the row is
 * drawn, the two that work work, and the two that do not say what they are
 * waiting for — is the one that neither lies nor pretends the plan does not
 * exist.
 */
function WalletActions() {
  const [note, setNote] = useState<string | null>(null);
  const action = {
    display: 'grid', placeItems: 'center', gap: 4, minHeight: 66, flex: 1, minWidth: 74,
    borderRadius: 14, border: '1px solid var(--line)', background: 'var(--card)',
    fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)',
  };
  const soon = (what: string) => () => setNote(
    `${what} money between people is not open yet — it needs a payments licence Together City does not hold. Paying a business you have talked to works today.`,
  );

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <a href="#top-up" style={{ ...action, textDecoration: 'none' }}>
          <span aria-hidden style={{ fontSize: 18 }}>＋</span>
          Add money
        </a>
        <Link to="/financial/invoices" style={{ ...action, textDecoration: 'none' }}>
          <span aria-hidden style={{ fontSize: 18 }}>▸</span>
          Pay
        </Link>
        <button type="button" style={action} onClick={soon('Sending')}>
          <span aria-hidden style={{ fontSize: 18 }}>↗</span>
          Send
        </button>
        <button type="button" style={action} onClick={soon('Requesting')}>
          <span aria-hidden style={{ fontSize: 18 }}>↙</span>
          Request
        </button>
      </div>
      {note && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }} role="status">{note}</p>
      )}
    </div>
  );
}

/**
 * WHAT IS WAITING TO BE PAID, on the screen somebody opens to check their money.
 *
 * Only when there is something. A permanent empty "Invoices" panel on a wallet
 * is a panel people learn to scroll past, and the Financial rail already has a
 * door to the full list.
 */
function InvoicesWaiting() {
  const q = useMyInvoices();
  if (q.isLoading) return null;
  if (q.isError) {
    return (
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }} role="status">
        We couldn’t check for invoices just now. Your balance above is unaffected.
      </p>
    );
  }
  const waiting = (q.data?.items ?? []).filter((i) => i.payable);
  if (waiting.length === 0) return null;

  return (
    <div style={{ marginBottom: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <strong style={{ fontSize: 13.5 }}>Waiting to be paid</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{inr(q.data?.dueInr ?? 0)} in total</span>
        <Link to="/financial/invoices" style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>
          See all →
        </Link>
      </div>
      {waiting.slice(0, 2).map((i) => (
        <InvoiceCard key={i.id} inv={i} who={i.businessName ?? 'A business'} />
      ))}
    </div>
  );
}

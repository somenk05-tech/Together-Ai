import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useWallet, useTopUp, useServices, useLinkCard, useRemoveCard, catIcon, inr, type Txn } from '../api';

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
      <span style={{ fontWeight: 700, fontSize: 14, color: credit ? '#2e7d32' : 'var(--ink)' }}>{credit ? '+' : '−'}{inr(t.amountInr)}</span>
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
  if (wallet.isError || !wallet.data) return <EmptyState title="Couldn't load your wallet" hint="Start the backend and reload." />;
  const w = wallet.data;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Financial · Wallet</div>
      <h1 style={{ fontSize: 26 }}>Your city wallet</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        One balance for the whole city — top up here and pay across Nutrition, Beauty and Medical.
      </p>

      <div className="card" style={{ marginBottom: 14, background: 'linear-gradient(135deg, var(--accent) 0%, #3a1220 100%)', color: '#fff', border: 'none' }}>
        <div style={{ fontSize: 12, opacity: .85, textTransform: 'uppercase', letterSpacing: '.08em' }}>Balance</div>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{inr(w.balanceInr)}</div>
        <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 12.5 }}>
          <div><div style={{ opacity: .8 }}>Spent this month</div><div style={{ fontWeight: 700, fontSize: 15 }}>{inr(w.spentThisMonthInr)}</div></div>
          <div><div style={{ opacity: .8 }}>Lifetime spend</div><div style={{ fontWeight: 700, fontSize: 15 }}>{inr(w.lifetimeSpendInr)}</div></div>
        </div>
      </div>

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

      <div className="card" style={{ marginBottom: 16 }}>
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="eyebrow">Recent activity</div>
          <Link to="/financial/transactions" style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--accent)', fontWeight: 600 }}>See all →</Link>
        </div>
        {w.recent.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>No activity yet. Top up, then pay across any hub — it all flows through here.</p>
        ) : w.recent.map((t) => <TxnRow key={t.id} t={t} />)}
      </div>

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

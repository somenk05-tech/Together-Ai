import { useState } from 'react';
import { EmptyState, Spinner } from '@/components/ui';
import { useTransactions, catColor, catIcon, inr, type Txn } from '../api';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'medical', label: 'Medical' },
  { key: 'dating', label: 'Dating' },
  { key: 'wallet', label: 'Top-ups' },
];

function Row({ t }: { t: Txn }) {
  const credit = t.direction === 'credit';
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--surface-2, #f4efe9)', fontSize: 17 }}>{catIcon[t.category] ?? '•'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.label}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          <span style={{ color: catColor[t.category], fontWeight: 600 }}>{t.hub}</span> · {t.date.slice(0, 10)}
        </div>
      </div>
      <span style={{ fontWeight: 700, fontSize: 14.5, color: credit ? '#2e7d32' : 'var(--ink)' }}>{credit ? '+' : '−'}{inr(t.amountInr)}</span>
    </div>
  );
}

/** Transactions — the unified feed across every hub. */
export function Transactions() {
  const q = useTransactions();
  const [filter, setFilter] = useState('all');

  if (q.isLoading) return <Spinner label="Loading your transactions…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load transactions" hint="Start the backend and reload." />;

  const rows = filter === 'all' ? q.data : q.data.filter((t) => t.category === filter);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Financial · Transactions</div>
      <h1 style={{ fontSize: 26 }}>Everything, in one place</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px' }}>
        Every order and top-up across Together City, together.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              border: '1.5px solid var(--line)', background: filter === f.key ? 'var(--accent)' : 'transparent', color: filter === f.key ? '#fff' : 'var(--ink-soft)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🧾" title="Nothing here yet" hint="Top up your wallet or order from another hub." />
      ) : (
        <div className="card">{rows.map((t) => <Row key={t.id} t={t} />)}</div>
      )}
    </div>
  );
}

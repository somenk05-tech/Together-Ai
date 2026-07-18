import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useSpending, catColor, catIcon, inr } from '../api';

/** Spending — where your money goes across the city, this month. */
export function Spending() {
  const q = useSpending();
  if (q.isLoading) return <Spinner label="Adding up your spending…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load spending" hint="Start the backend and reload." />;
  const s = q.data;
  const max = Math.max(1, ...s.byCategory.map((c) => c.amountInr));

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Financial · Spending</div>
      <h1 style={{ fontSize: 26 }}>This month across the city</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{inr(s.totalInr)}</div>
          {s.trendPct !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: s.trendPct > 0 ? '#c62828' : '#2e7d32' }}>
              {s.trendPct > 0 ? '▲' : '▼'} {Math.abs(s.trendPct)}% vs last month
            </span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{s.txnCount} transactions · last month {inr(s.prevTotalInr)}</div>
      </div>

      {s.totalInr === 0 ? (
        <EmptyState icon="🧾" title="No spending yet this month" hint="Orders from Nutrition, Beauty and Medical consults show up here automatically." />
      ) : (
        <div className="card">
          <div className="eyebrow">By category</div>
          {s.byCategory.map((c) => (
            <div key={c.category} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{catIcon[c.category]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.label} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {c.hint}</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{inr(c.amountInr)}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{c.pct}%</div>
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(c.amountInr / max) * 100}%`, background: catColor[c.category], transition: 'width .3s' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <Link to="/financial/budgets"><Button variant="line" size="sm">Set budgets →</Button></Link>
        <Link to="/financial/transactions"><Button variant="line" size="sm">All transactions →</Button></Link>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Button, EmptyState, Fold, Spinner } from '@/components/ui';
import { useSpending, catColor, catIcon, inr } from '../api';

/** Spending — where your money goes across the city, this month. */
export function Spending() {
  const q = useSpending();
  if (q.isLoading) return <Spinner label="Adding up your spending…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load spending" hint="Your transactions are safe — this is only the summary that didn’t arrive." />;
  const s = q.data;
  const max = Math.max(1, ...s.byCategory.map((c) => c.amountInr));
  // How many categories were actually spent in — the number the closed fold
  // reports. Counted rather than assumed: a month with nothing in it must say
  // so, not report "0 of 8" as though that were a breakdown.
  const used = s.byCategory.filter((c) => c.amountInr > 0).length;

  return (
    <div>
      <div className="eyebrow">Financial · Spending</div>
      <h1 style={{ fontSize: 26 }}>This month across the city</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{inr(s.totalInr)}</div>
          {s.trendPct !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: s.trendPct > 0 ? 'var(--danger-ink)' : 'var(--ok-ink)' }}>
              {s.trendPct > 0 ? '▲' : '▼'} {Math.abs(s.trendPct)}% vs last month
            </span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{s.txnCount} transactions · last month {inr(s.prevTotalInr)}</div>
      </div>

      {s.totalInr === 0 ? (
        <EmptyState icon="🧾" title="No spending yet this month" hint="Orders from Nutrition, Beauty and Medical consults show up here automatically." />
      ) : (
        /* FOLDED, AND CLOSED. Eight categories, and on most months seven of
           them read ₹0 — the shape of this list is one bar and a column of
           zeroes, which is a lot of screen to say "you spent it on one thing".
           The meta says which thing and how much, so the closed section answers
           the page's question on its own, and opening it is for the breakdown
           rather than for the answer.

           AN UNBRACED COMMENT, AND IT TOOK TWO GOES. This is the inside of a
           ternary's parentheses, where the contents must be one expression: a
           braced JSX comment is a CHILD, legal between siblings and not here,
           and it fails as a parse error six lines further down — a long way
           from what caused it.

           The second go failed for a different reason worth knowing: writing
           the braced form inside this comment to explain it ENDS the comment,
           because the sequence that closes a block comment appears inside the
           braces. Describe it; do not quote it. */
        <Fold
          title="By category"
          meta={`${inr(s.totalInr)} · ${used === 0 ? 'nothing spent yet'
            : `${used} of ${s.byCategory.length} categor${used === 1 ? 'y' : 'ies'}`}`}
        >
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
        </Fold>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <Link to="/financial/budgets"><Button variant="line" size="sm">Set budgets →</Button></Link>
        <Link to="/financial/transactions"><Button variant="line" size="sm">All transactions →</Button></Link>
      </div>
    </div>
  );
}

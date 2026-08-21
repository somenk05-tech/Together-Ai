import { useEffect, useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBudgets, useSetBudget, catColor, catIcon, inr, type Budget } from '../api';

function BudgetRow({ b }: { b: Budget }) {
  const set = useSetBudget();
  const [val, setVal] = useState(String(b.monthlyInr));
  const [editing, setEditing] = useState(false);
  useEffect(() => { setVal(String(b.monthlyInr)); }, [b.monthlyInr]);

  const barColor = b.over ? 'var(--danger-ink)' : b.pct > 80 ? 'var(--warn-ink)' : catColor[b.category];
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 17 }}>{catIcon[b.category]}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.label}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{inr(b.spentInr)} of {inr(b.monthlyInr)}{b.isDefault ? ' (default)' : ''}</div>
        </div>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" aria-label={`Monthly budget for ${b.label}`} min={0} value={val} onChange={(e) => setVal(e.target.value)}
              style={{ width: 96, padding: '7px 9px', border: '1.5px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit' }} />
            <Button variant="accent" size="sm" disabled={set.isPending}
              onClick={() => set.mutate({ category: b.category, monthlyInr: Number(val) || 0 }, { onSuccess: () => setEditing(false) })}>Save</Button>
          </div>
        ) : (
          <Button variant="line" size="sm" onClick={() => setEditing(true)}>Edit</Button>
        )}
      </div>
      <div style={{ height: 9, borderRadius: 'var(--r-full)', background: 'var(--line)', marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, b.pct)}%`, background: barColor, transition: 'width .3s' }} />
      </div>
      {b.over && <div style={{ fontSize: 11.5, color: 'var(--danger-ink)', fontWeight: 600, marginTop: 4 }}>Over budget by {inr(b.spentInr - b.monthlyInr)}</div>}
    </div>
  );
}

/** Budgets — set a monthly cap per category; spend tracks against it live. */
export function Budgets() {
  const q = useBudgets();
  if (q.isLoading) return <Spinner label="Loading your budgets…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load budgets" hint="Your budgets are still set exactly as you left them. We just couldn’t read them." />;

  return (
    <div>
      <div className="eyebrow">Financial · Budgets</div>
      <h1 style={{ fontSize: 26 }}>Monthly budgets</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Set a cap per category. Spend from Nutrition, Beauty and Medical counts against it automatically.
      </p>
      <div className="card">
        {q.data.map((b) => <BudgetRow key={b.category} b={b} />)}
      </div>
    </div>
  );
}

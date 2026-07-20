import { useMemo, useState } from 'react';
import { EmptyState, Spinner } from '@/components/ui';
import { useGroceryPlan } from '../hooks';
import type { GroceryAisle, GroceryPlanItem } from '../api';

type View = 'grocery' | 'recipe';

/** One shopping item row — checkbox, name, real-unit quantity, and an
 *  expandable "used in" breakdown of which recipes need it. */
function ItemRow({ item, checked, onToggle }: { item: GroceryPlanItem; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const multi = item.usedIn.length > 1;
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
        <button
          onClick={onToggle}
          aria-label={checked ? 'Uncheck' : 'Check off'}
          style={{
            flex: 'none', width: 22, height: 22, borderRadius: 7, cursor: 'pointer',
            border: checked ? 'none' : '1.8px solid var(--line)',
            background: checked ? 'var(--accent, #1e8449)' : 'transparent',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900, transition: 'all .12s', padding: 0,
          }}
        >
          {checked ? '✓' : ''}
        </button>

        <button
          onClick={() => multi && setOpen((o) => !o)}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0,
            cursor: multi ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 1,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize', textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--muted)' : 'var(--ink)' }}>
            {item.name}
          </span>
          {multi && (
            <span className="muted" style={{ fontSize: 11.5 }}>
              {open ? '▾' : '▸'} used in {item.usedIn.length} recipes
            </span>
          )}
        </button>

        <span style={{ flex: 'none', whiteSpace: 'nowrap', fontWeight: 700, fontSize: 13.5, color: checked ? 'var(--muted)' : 'var(--ink)' }}>
          {item.qtyLabel}
        </span>
      </div>

      {open && multi && (
        <div style={{ padding: '2px 14px 12px 48px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {item.usedIn.map((u, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <span className="muted" style={{ textTransform: 'capitalize' }}>· {u.recipe}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>{u.qtyLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A supermarket aisle — icon header, shelf life + storage tip, item rows. */
function Aisle({ aisle, checked, toggle }: { aisle: GroceryAisle; checked: Set<string>; toggle: (n: string) => void }) {
  const shelf = aisle.items[0];
  const done = aisle.items.filter((i) => checked.has(i.name)).length;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, borderRadius: 16 }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--paper)' }}>
        <span style={{ fontSize: 22 }}>{aisle.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>{aisle.title}</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>{aisle.note}</span>
          </div>
          {shelf && (shelf.shelfLife || shelf.storageTip) && (
            <p className="muted" style={{ fontSize: 11.5, margin: '3px 0 0' }}>
              {shelf.shelfLife ? `🕒 Keeps ${shelf.shelfLife}` : ''}{shelf.shelfLife && shelf.storageTip ? ' · ' : ''}{shelf.storageTip ? `📦 ${shelf.storageTip}` : ''}
            </p>
          )}
        </div>
        <span className="muted" style={{ flex: 'none', fontSize: 12, fontWeight: 600 }}>{done}/{aisle.items.length}</span>
      </div>
      <div>
        {aisle.items.map((it) => (
          <ItemRow key={it.name} item={it} checked={checked.has(it.name)} onToggle={() => toggle(it.name)} />
        ))}
      </div>
    </div>
  );
}

/**
 * Supermarket-style grocery planner (Grocery Planner redesign). Aisles in
 * shopping order, real-unit quantities, expandable "used in", a Grocery/Recipe
 * view toggle, check-off, and per-aisle shelf life + storage tips.
 */
export function GroceryPlanner({ mode }: { mode: 'individual' | 'family' }) {
  const plan = useGroceryPlan(mode);
  const [view, setView] = useState<View>('grocery');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (n: string) => setChecked((s) => { const next = new Set(s); next.has(n) ? next.delete(n) : next.add(n); return next; });

  const aisles = plan.data?.aisles ?? [];
  const recipes = plan.data?.recipes ?? [];
  const itemCount = plan.data?.itemCount ?? 0;
  const checkedCount = useMemo(() => {
    let c = 0; for (const a of aisles) for (const i of a.items) if (checked.has(i.name)) c++; return c;
  }, [aisles, checked]);

  if (plan.isLoading) return <Spinner label="Building your shopping list…" />;

  if (itemCount === 0) {
    return (
      <EmptyState
        icon="🛒"
        title="No shopping list yet"
        hint={`Generate a ${mode === 'family' ? 'family ' : ''}weekly meal plan — your grocery list builds itself from it.`}
      />
    );
  }

  return (
    <div>
      {/* progress + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{checkedCount}/{itemCount}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>items checked off</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${itemCount ? (checkedCount / itemCount) * 100 : 0}%`, background: 'var(--accent, #1e8449)', borderRadius: 999, transition: 'width .2s' }} />
          </div>
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
          {(['grocery', 'recipe'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 16px', fontSize: 12.5, fontWeight: 700,
                background: view === v ? 'var(--card, #fff)' : 'transparent',
                color: view === v ? 'var(--ink)' : 'var(--muted)',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all .12s',
              }}
            >
              {v === 'grocery' ? '🛒 Grocery' : '🍳 Recipe'}
            </button>
          ))}
        </div>
      </div>

      {view === 'grocery' ? (
        <>
          {aisles.map((a) => <Aisle key={a.key} aisle={a} checked={checked} toggle={toggle} />)}
        </>
      ) : (
        <>
          {recipes.map((r, ri) => (
            <div key={ri} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, borderRadius: 16 }}>
              <div style={{ padding: '13px 16px', background: 'var(--paper)' }}>
                <h3 style={{ fontSize: 15.5, margin: 0, textTransform: 'capitalize' }}>{r.recipe}</h3>
                <span className="muted" style={{ fontSize: 11.5 }}>{r.items.length} ingredients</span>
              </div>
              <div>
                {r.items.map((it, ii) => (
                  <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 16px', fontSize: 13.5, borderTop: '1px solid var(--line)' }}>
                    <span style={{ textTransform: 'capitalize' }}>{it.name}</span>
                    <span className="muted" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{it.qtyLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { PageHeader, Button, Spinner, EmptyState } from '@/components/ui';
import { usePantry, usePantryMutations } from '@/features/nutrition/hooks';
import type { PantryItemView } from '@/features/nutrition/api';

const fld: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

function Row({ it, onSet, onRemove, busy }: { it: PantryItemView; onSet: (g: number) => void; onRemove: () => void; busy: boolean }) {
  const step = it.unit === 'ml' || it.unit === 'l' ? 100 : it.unit === 'g' || it.unit === 'kg' ? 100 : 1;
  const stepG = it.unit === 'pc' || it.unit === 'bunch' || it.unit === 'bulb' ? Math.max(1, Math.round(it.grams / Math.max(1, parseFloat(it.qtyLabel) || 1))) : step;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{it.name}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button aria-label="Less" disabled={busy} onClick={() => onSet(Math.max(0, it.grams - stepG))} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>−</button>
        <span style={{ minWidth: 62, textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{it.qtyLabel}</span>
        <button aria-label="More" disabled={busy} onClick={() => onSet(it.grams + stepG)} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>+</button>
      </div>
      <button aria-label="Remove" disabled={busy} onClick={onRemove} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
    </div>
  );
}

/**
 * Shared Pantry — Family. One pantry per household: rice, atta, oil, dal, milk,
 * vegetables & spices shared across everyone. Stocks automatically when groceries
 * are ordered; adjust on-hand amounts as meals are cooked.
 */
export function FamilyPantry() {
  const pantry = usePantry();
  const { add, stock, update, remove } = usePantryMutations();
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    add.mutate({ name: name.trim(), grams: grams ? +grams : 0 }, { onSuccess: () => { setName(''); setGrams(''); } });
  };

  const data = pantry.data;
  const busy = update.isPending || remove.isPending || add.isPending || stock.isPending;

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 07"
        title="Shared Pantry"
        sub="One pantry for the whole household — staples everyone shares. It stocks up when you order groceries; draw items down as you cook." />

      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Add to the pantry</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ ...fld, flex: 2, minWidth: 160 }} value={name} placeholder="Item, e.g. Basmati rice"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            <input style={{ ...fld, width: 120 }} value={grams} type="number" placeholder="grams (opt.)"
              onChange={(e) => setGrams(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            <Button variant="accent" onClick={submit} disabled={add.isPending || !name.trim()}>{add.isPending ? 'Adding…' : 'Add'}</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Button variant="line" size="sm" onClick={() => stock.mutate()} disabled={stock.isPending}>
              {stock.isPending ? 'Stocking…' : '↺ Stock from my grocery list'}
            </Button>
            <span className="muted" style={{ fontSize: 11.5 }}>Ordered groceries are added here automatically.</span>
          </div>
        </div>

        {pantry.isLoading && <Spinner label="Opening the pantry…" />}
        {data && data.itemCount === 0 && (
          <EmptyState icon="🥫" title="Your pantry is empty" hint="Add staples above, or stock it from your grocery list in one tap." />
        )}
        {data && data.itemCount > 0 && (
          <>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>{data.itemCount} item{data.itemCount === 1 ? '' : 's'} on hand · shared across the household</p>
            {data.aisles.map((a) => (
              <div key={a.key} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, borderRadius: 16 }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)' }}>
                  <span style={{ fontSize: 19 }}>{a.icon}</span>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{a.title}</h3>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{a.items.length}</span>
                </div>
                {a.items.map((it) => (
                  <Row key={it.id} it={it} busy={busy}
                    onSet={(g) => update.mutate({ id: it.id, grams: g })}
                    onRemove={() => remove.mutate(it.id)} />
                ))}
              </div>
            ))}
          </>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          The pantry is owned by the household, not any one person. It updates when groceries are ordered and as meals are cooked, so the grocery planner can skip what you already have.
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { usePantry, usePantryMutations } from '../hooks';
import { useComposedPlan } from '../composed.api';
import type { PantryItemView } from '../api';

/** Local YYYY-MM-DD (the citizen's day, matching the plan's day keys). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Today's meals with a one-tap "Cooked" — this is what makes the bars move.
 * Marking a meal cooked draws its ingredients out of the pantry (once; cooking
 * the same meal twice won't double-deduct).
 */
function TodaysCooking() {
  const plan = useComposedPlan();
  const { cooked } = usePantryMutations();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const start = plan.data?.planStartDate;
  const today = todayISO();
  const day = (plan.data?.days ?? []).find((d) => start && addDaysISO(start, d.dayIndex) === today);
  if (!day?.meals?.length) return null;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <strong style={{ fontSize: 13.5 }}>🍳 Today's meals</strong>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>
        Mark a meal cooked and its ingredients come off your shelves.
      </p>
      {day.meals.map((m) => {
        const key = `${today}:${m.slot}`;
        const isDone = done[key];
        return (
          <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{m.title}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{m.label}{m.scheduledTime ? ` · ${m.scheduledTime}` : ''}</span>
            </span>
            <Button size="sm" variant={isDone ? 'line' : 'accent'}
              disabled={isDone || cooked.isPending}
              onClick={() => cooked.mutate({ mealKey: key, label: m.title }, { onSuccess: () => setDone((c) => ({ ...c, [key]: true })) })}>
              {isDone ? '✓ Cooked' : 'Cooked'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** Colour the depletion bar by how much is left — green → amber → red. */
function barColor(pct: number): string {
  if (pct >= 60) return '#2e7d47';
  if (pct >= 30) return '#c9922e';
  return '#c0392b';
}

/**
 * The depletion line: a full bar the day it's stocked, shrinking every time a
 * meal that uses this ingredient is cooked. This is the visual answer to
 * "what's actually left in my kitchen".
 */
function DepletionBar({ item }: { item: PantryItemView }) {
  const pct = Math.max(0, Math.min(100, item.remainingPct ?? 100));
  const out = item.grams <= 0;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 7, borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: barColor(pct),
          transition: 'width .4s ease-out',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11.5 }}>
        <span className="muted">
          {out ? 'Used up' : `${item.qtyLabel} left`}
          {item.startQtyLabel && !out ? ` of ${item.startQtyLabel}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: barColor(pct) }}>{pct}%</span>
      </div>
    </div>
  );
}

/** Nutrition · Pantry — what you have, drawn down as meals get cooked. */
export function Pantry() {
  const q = usePantry();
  const { add, stock, update, remove } = usePantryMutations();
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('');

  const data = q.data;
  const lowItems: PantryItemView[] = (data?.aisles ?? [])
    .flatMap((a) => a.items)
    .filter((i) => (i.remainingPct ?? 100) < 30)
    .sort((a, b) => (a.remainingPct ?? 0) - (b.remainingPct ?? 0));

  const submitAdd = () => {
    const n = name.trim();
    if (!n) return;
    add.mutate({ name: n, grams: Number(grams) || undefined }, { onSuccess: () => { setName(''); setGrams(''); } });
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div className="eyebrow">Nutrition · Pantry</div>
      <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>🫙 Your pantry</h1>
      <p className="lede" style={{ marginBottom: 18 }}>
        What's on your shelves right now. Each line empties as the meals that use it get cooked,
        and your grocery list only asks for what's actually missing.
      </p>

      {/* Add / restock */}
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item (e.g. Rice)"
          onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
          style={{ flex: 2, minWidth: 170, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontFamily: 'inherit', fontSize: 14 }} />
        <input value={grams} onChange={(e) => setGrams(e.target.value.replace(/[^0-9]/g, ''))} placeholder="grams"
          onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
          style={{ flex: 1, minWidth: 90, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontFamily: 'inherit', fontSize: 14 }} />
        <Button size="sm" variant="accent" onClick={submitAdd} disabled={add.isPending || !name.trim()}>
          {add.isPending ? 'Adding…' : '+ Add'}
        </Button>
        <Button size="sm" variant="line" onClick={() => stock.mutate()} disabled={stock.isPending}>
          {stock.isPending ? 'Stocking…' : '🛒 Stock from grocery list'}
        </Button>
      </div>

      <TodaysCooking />

      {/* Running low */}
      {lowItems.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(201,146,46,.5)' }}>
          <strong style={{ fontSize: 13.5 }}>⚠️ Running low</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {lowItems.slice(0, 10).map((i) => (
              <span key={i.id} style={{ fontSize: 12.5, border: '1px solid var(--line)', borderRadius: 999, padding: '5px 11px', background: 'var(--paper)' }}>
                {i.name} · <strong style={{ color: barColor(i.remainingPct ?? 0) }}>{i.remainingPct ?? 0}%</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {q.isLoading && <Spinner label="Loading your pantry…" />}
      {q.isError && <p className="muted" style={{ fontSize: 13.5 }}>Couldn't load your pantry. Reload to try again.</p>}

      {data && data.itemCount === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🫙</div>
          <p style={{ fontSize: 15, margin: '0 0 4px' }}>Your pantry is empty</p>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Add an item above, or stock it straight from your grocery list.
          </p>
        </div>
      )}

      {(data?.aisles ?? []).map((aisle) => (
        <div key={aisle.key} className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>{aisle.icon} {aisle.title}</div>
          {aisle.items.map((it) => (
            <div key={it.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 120 }}>{it.name}</span>
                <button type="button" title="Use 100g" onClick={() => update.mutate({ id: it.id, grams: Math.max(0, it.grams - 100) })}
                  style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 12, padding: '4px 9px' }}>−100g</button>
                <button type="button" title="Add 100g" onClick={() => update.mutate({ id: it.id, grams: it.grams + 100 })}
                  style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 12, padding: '4px 9px' }}>+100g</button>
                <button type="button" onClick={() => remove.mutate(it.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: '#c0392b' }}>Remove</button>
              </div>
              <DepletionBar item={it} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

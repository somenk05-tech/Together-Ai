import { useState } from 'react';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { useNutritionHistory } from '../hooks';
import { nutritionApi } from '../api';
import type { NutritionHistoryWeek } from '../types';

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
};

/** A single stored week — expands to show each dated day's meals + totals. */
function WeekRow({ w }: { w: NutritionHistoryWeek }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      setLoading(true);
      try { setDetail(await nutritionApi.historyDetail(w.id)); } catch { /* ignore */ }
      setLoading(false);
    }
  };

  const days = (detail?.days as Array<{ dateLabel?: string; day: string; totals?: Record<string, number>; meals?: Array<{ slot: string; recipeName: string; kcal: number; skipped?: boolean }> }> | undefined) ?? [];
  const SLOT = { b: 'Breakfast', l: 'Lunch', s: 'Snack', d: 'Dinner' } as Record<string, string>;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      <button type="button" onClick={toggle}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontFamily: 'inherit' }}>
        <span>
          <span style={{ display: 'block', fontFamily: 'var(--serif)', fontSize: 17 }}>Week {w.weekNumber} · {w.weekLabel}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {fmtDate(w.startDate)} – {fmtDate(w.endDate)} · saved {fmtDate(w.createdAt)}
            {w.diet ? ` · ${w.diet}` : ''}
          </span>
        </span>
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'block', fontWeight: 700 }}>{(w.totals.kcal ?? 0).toLocaleString('en-IN')} kcal</span>
          <span className="muted" style={{ fontSize: 12 }}>₹{w.cost} · {w.variety.recipeVarietyPct ?? 0}% variety {open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', background: 'var(--paper)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12.5, marginBottom: 10 }}>
            <span className="muted">Weekly protein <b style={{ color: 'var(--ink)' }}>{w.totals.protein ?? 0} g</b></span>
            <span className="muted">Carbs <b style={{ color: 'var(--ink)' }}>{w.totals.carbs ?? 0} g</b></span>
            <span className="muted">Fat <b style={{ color: 'var(--ink)' }}>{w.totals.fat ?? 0} g</b></span>
            <span className="muted">Fibre <b style={{ color: 'var(--ink)' }}>{w.totals.fiber ?? 0} g</b></span>
            <span className="muted">Distinct recipes <b style={{ color: 'var(--ink)' }}>{w.variety.distinctRecipes ?? 0}/{w.variety.mealsServed ?? 0}</b></span>
          </div>
          {loading && <Spinner label="Loading the week…" />}
          {!loading && days.map((d, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <b>{d.dateLabel ?? d.day}</b>
                <span className="muted">{Math.round(d.totals?.kcal ?? 0).toLocaleString('en-IN')} kcal · ₹{Math.round(d.totals?.cost ?? 0)}</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
                {(d.meals ?? []).map((m, j) => (
                  <span key={j} style={{ textDecoration: m.skipped ? 'line-through' : 'none', opacity: m.skipped ? 0.6 : 1 }}>
                    {j > 0 ? ' · ' : ''}{SLOT[m.slot] ?? m.slot}: {m.recipeName}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nutrition History (spec §19/§20) — every generated week, permanently stored,
 *  dated, and reviewable. Part of the user's Health Profile timeline. */
export function NutritionHistory() {
  const history = useNutritionHistory('individual');

  return (
    <div>
      <PageHeader eyebrow="Nutrition Hub · Health Profile"
        title="Nutrition History 📅"
        sub="Every weekly plan you generate is saved to your Health Profile with real calendar dates — a chronological record you and your care team can review over time." />

      {history.isLoading && <Spinner label="Loading your nutrition history…" />}
      {history.isError && <EmptyState icon="📅" title="Couldn't load history" hint="Reload in a moment." />}
      {history.data && history.data.length === 0 && (
        <EmptyState icon="📅" title="No saved weeks yet" hint="Generate a weekly meal plan and it will be recorded here automatically." />
      )}
      {history.data && history.data.length > 0 && (
        <div style={{ maxWidth: 760 }}>
          {history.data.map((w) => <WeekRow key={w.id} w={w} />)}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Card, Spinner, EmptyState, Button, Chip, Modal } from '@/components/ui';
import {
  useComposedPlan, useMealSettings, useSaveMealSettings,
  type ComposedMeal, type MealComponent, type CuisineBucket,
} from '../composed.api';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CUISINES = ['Indian', 'Chinese', 'Thai', 'Italian', 'Continental', 'Mediterranean', 'Global'];
const PROTOCOLS = ['12:12', '14:10', '16:8', '18:6', '20:4', 'omad'];
const BUCKETS: { key: CuisineBucket; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snacks' },
];

function macroRow(t: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
      <span><strong>{Math.round(t.kcal)}</strong> kcal</span>
      <span className="muted">P {Math.round(t.protein)}g</span>
      <span className="muted">C {Math.round(t.carbs)}g</span>
      <span className="muted">F {Math.round(t.fat)}g</span>
      <span className="muted">Fib {Math.round(t.fiber)}g</span>
    </div>
  );
}

/** A composite meal card — title, scheduled time, components; expands to the full meal (Rule 9). */
function MealCardV2({ meal }: { meal: ComposedMeal }) {
  const [open, setOpen] = useState<MealComponent | null>(null);
  const [expanded, setExpanded] = useState(false);
  return (
    <Card style={{ padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
            {meal.label} · {meal.scheduledTime}
          </div>
          <h3 style={{ margin: '2px 0 0', fontSize: 17 }}>{meal.title}</h3>
        </div>
        <Chip tone="accent">{Math.round(meal.energyPct * 100)}% of day</Chip>
      </div>

      <div style={{ margin: '10px 0' }}>{macroRow(meal.totals)}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {meal.components.map((c) => (
          <button key={c.recipeId + c.role} type="button" onClick={() => setOpen(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--line)',
              borderRadius: 10, padding: '8px 11px', background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 11.5, textTransform: 'capitalize' }}>{c.role} · {c.grams} g · {c.kcal} kcal</span>
            </span>
            <span className="muted" style={{ fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <Button variant="line" size="sm" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Hide full meal' : 'Open full meal'}</Button>
        <span className="muted" style={{ fontSize: 12 }}>⏱ {meal.minutes} min · {meal.components.length} recipes</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Complete meal · combined ingredients</div>
          {meal.components.map((c) => (
            <div key={c.recipeId + c.role} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name} <span className="muted" style={{ fontWeight: 400 }}>· {c.minutes} min</span></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {c.ingredients.map((i) => `${i.name} ${i.grams}g${i.pantry ? ' (pantry)' : ''}`).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name}
        footer={<div className="muted" style={{ fontSize: 12 }}>{open?.minutes} min · one standard serving</div>}>
        {open && (
          <div>
            <div style={{ marginBottom: 12 }}>{macroRow(open)}</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Ingredients</div>
            {open.ingredients.map((i) => (
              <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{i.name}{i.pantry && <span className="muted" style={{ fontSize: 11 }}> · pantry</span>}</span>
                <span className="muted">{i.grams} g</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  );
}

/** Meal-settings drawer: intermittent fasting + per-slot cuisine (Rules 11/12, IF). */
function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useMealSettings();
  const save = useSaveMealSettings();
  const s = settings.data;
  if (!open) return null;

  const fasting = s?.fasting ?? { enabled: false, protocol: '16:8' };
  const cuisineBySlot = s?.cuisineBySlot ?? {};
  const locks = s?.cuisineLocks ?? {};

  const setCuisine = (bucket: CuisineBucket, cuisine: string, weight: number) => {
    const cur = { ...(cuisineBySlot[bucket] ?? {}) };
    if (weight <= 0) delete cur[cuisine]; else cur[cuisine] = weight;
    save.mutate({ cuisineBySlot: { ...cuisineBySlot, [bucket]: cur } });
  };

  return (
    <Modal open={open} onClose={onClose} title="Meal settings" width={560}
      footer={<Button variant="accent" onClick={onClose}>Done</Button>}>
      {settings.isLoading && <Spinner label="Loading settings…" />}
      {s && (
        <>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Intermittent fasting</h3>
          {s.fastingSafety.level !== 'ok' && (
            <div style={{ background: s.fastingSafety.level === 'block' ? '#fdecec' : '#faf3e0', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12.5 }}>
              <strong>{s.fastingSafety.level === 'block' ? 'Not recommended for you.' : 'Please check with your clinician.'}</strong>
              <ul style={{ margin: '6px 0 0 16px' }}>{s.fastingSafety.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13.5 }}>
            <input type="checkbox" checked={Boolean(fasting.enabled)} disabled={s.fastingSafety.level === 'block'}
              onChange={(e) => save.mutate({ fasting: { ...fasting, enabled: e.target.checked } })} />
            Enable intermittent fasting
          </label>
          {fasting.enabled && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {PROTOCOLS.map((p) => (
                <Chip key={p} selected={fasting.protocol === p} onClick={() => save.mutate({ fasting: { ...fasting, protocol: p } })}>
                  {p === 'omad' ? 'OMAD' : p}
                </Chip>
              ))}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Schedule: {s.schedule.meals.map((m) => `${m.label} ${m.scheduledTime}`).join(' · ')}
          </div>

          <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>Cuisine by meal</h3>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Set which cuisines each meal draws from. Lock a meal to allow only those cuisines.</p>
          {BUCKETS.map((b) => (
            <div key={b.key} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13.5 }}>{b.label}</strong>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={Boolean(locks[b.key])} onChange={(e) => save.mutate({ cuisineLocks: { ...locks, [b.key]: e.target.checked } })} />
                  Lock
                </label>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CUISINES.map((c) => {
                  const w = cuisineBySlot[b.key]?.[c] ?? 0;
                  return (
                    <Chip key={c} selected={w > 0} onClick={() => setCuisine(b.key, c, w > 0 ? 0 : 100)}>{c}</Chip>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

/**
 * The Meal Plan — the clinical, composite, 5-slot planner (Meal-Planning-Engine-Spec).
 * Every day shows Breakfast · Morning Snack · Lunch · Evening Snack · Dinner (or the
 * fasting-window meals), each a complete titled meal with a scheduled time; the
 * grocery list is derived strictly from the plan's recipes.
 */
export function MealPlan() {
  const plan = useComposedPlan();
  const settingsSave = useSaveMealSettings();
  const [day, setDay] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<'plan' | 'grocery'>('plan');

  if (plan.isLoading) return <Spinner label="Composing your week…" />;
  if (plan.isError || !plan.data) return <EmptyState title="Couldn't build your plan" hint="Add your food preferences, then reload." />;

  const wk = plan.data;
  const d = wk.days[day];

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Nutrition · Meal Plan</div>
          <h1 style={{ fontSize: 26 }}>Your week, meal by meal</h1>
        </div>
        <Button variant="line" size="sm" onClick={() => setShowSettings(true)}>Meal settings</Button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 14px' }}>
        Complete meals from your prescription ({wk.prescription.kcal} kcal · {wk.prescription.protein} g protein).
        {wk.fasting ? ` Intermittent fasting: ${wk.protocol}.` : ''}
      </p>

      {!wk.validation.ok && (
        <div style={{ background: '#faf3e0', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12.5 }}>
          Plan notes: {wk.validation.issues.slice(0, 3).join('; ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['plan', 'grocery'] as const).map((t) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)}>{t === 'plan' ? 'Meal Plan' : 'Grocery List'}</Chip>
        ))}
      </div>

      {tab === 'plan' && (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14 }}>
            {wk.days.map((_, i) => (
              <Chip key={i} selected={i === day} onClick={() => setDay(i)}>{DAY_NAMES[i] ?? `Day ${i + 1}`}</Chip>
            ))}
          </div>
          {d.fasting && (
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Eating window {d.window.start}–{d.window.end}</p>
          )}
          {d.meals.map((m) => <MealCardV2 key={m.slot} meal={m} />)}
          <Card style={{ padding: '14px 18px', marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>Day total</strong>
              {macroRow(d.totals)}
            </div>
          </Card>
        </>
      )}

      {tab === 'grocery' && (
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>Weekly grocery ({wk.grocery.length} items)</strong>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" defaultChecked={false}
                onChange={(e) => settingsSave.mutate({ includePantry: e.target.checked })} />
              Include pantry staples
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Every item comes only from the recipes in your plan — nothing inferred.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '6px 16px' }}>
            {wk.grocery.map((g) => (
              <div key={g.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{g.name}</span>
                <span className="muted">{g.grams} {g.unit}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

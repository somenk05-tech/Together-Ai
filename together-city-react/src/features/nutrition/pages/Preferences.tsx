import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useFoodPref, useNutritionTargets, useUpdateFoodPref } from '../hooks';
import type { FoodPref } from '../api';
import { DIET_META } from './Recipes';

const DIETS: { key: string; label: string }[] = [
  { key: 'everything', label: 'Everything' },
  { key: 'veg', label: 'Veg' },
  { key: 'nonveg', label: 'Non-veg' },
  { key: 'pesc', label: 'Fish' },
  { key: 'egg', label: 'Egg' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'jain', label: 'Jain' },
];

const ACTIVITY: { value: number; label: string }[] = [
  { value: 1.2, label: 'Sedentary — desk days' },
  { value: 1.4, label: 'Lightly active — walks, errands' },
  { value: 1.6, label: 'Moderately active — 3–4 workouts/week' },
  { value: 1.8, label: 'Very active — daily training' },
  { value: 2.0, label: 'Athlete — hard training' },
];

const CUISINES = ['Indian', 'Chinese', 'Italian', 'Mexican', 'Thai', 'Continental', 'Japanese', 'Mediterranean', 'American', 'Middle Eastern'];
const PROTEINS = ['Chicken', 'Fish', 'Egg', 'Paneer', 'Tofu', 'Legumes', 'Mutton', 'Prawns'];
const MEATS = ['Chicken', 'Mutton', 'Fish', 'Prawns', 'Beef', 'Pork'];
const PATTERNS = ['Balanced', 'High protein', 'Low carb', 'Keto', 'Mediterranean', 'Diabetic-friendly', 'Heart-healthy', 'Low sodium', 'Gluten-free', 'Lactose-free'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DELIVERY = ['Morning (6–9am)', 'Midday (12–2pm)', 'Evening (5–8pm)'];

interface Extras {
  cuisines?: string[];
  proteins?: string[];
  meats?: string[];
  allergies?: string;
  excluded?: string;
  pattern?: string;
  maxCookMin?: number | null;
  conditions?: string;
  budgetInr?: number | null;
  delivery?: string;
  weekly?: Record<string, 'veg' | 'nonveg'>;
}

const field: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', boxSizing: 'border-box',
};
const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--muted)', display: 'block', margin: '14px 0 6px',
};

/** A pill toggle used for multi-select chips (cuisines, proteins, meats). */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
      background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)',
    }}>{children}</button>
  );
}

function TargetsCard() {
  const targets = useNutritionTargets();
  if (!targets.data) return null;
  const t = targets.data;
  const rows: [string, string][] = [
    ['Calories', `${t.kcal} kcal`], ['Protein', `${t.protein} g`], ['Carbs', `${t.carb} g`],
    ['Fat', `${t.fat} g`], ['Fibre', `${t.fiber} g`], ['Water', `${(t.waterMl / 1000).toFixed(1)} L`],
  ];
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="eyebrow">Your daily targets</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10, marginTop: 8 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600 }}>{v}</div>
            <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        These targets personalise every planner. <Link to="/nutrition/weekly" style={{ color: 'var(--accent)', fontWeight: 600 }}>Regenerate your week →</Link>
      </p>
    </div>
  );
}

/** Food Preference Profile — taste, health goals, budget and delivery behind every meal plan. */
export function Preferences() {
  const existing = useFoodPref();
  const update = useUpdateFoodPref();
  const [form, setForm] = useState<FoodPref | null>(null);
  const [ex, setEx] = useState<Extras>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing.data && !form) {
      setForm(existing.data);
      try { setEx(existing.data.extras ? JSON.parse(existing.data.extras) : {}); } catch { setEx({}); }
    }
  }, [existing.data, form]);

  if (existing.isLoading || !form) return <Spinner label="Loading your preferences…" />;

  const num = (v: string) => (v ? parseInt(v, 10) : null);
  const toggle = (list: string[] | undefined, v: string): string[] => {
    const arr = list ?? [];
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  };
  const setWeekly = (day: string, val: 'veg' | 'nonveg') =>
    setEx({ ...ex, weekly: { ...(ex.weekly ?? {}), [day]: val } });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const payload: Partial<FoodPref> = {
      diet: form.diet, goal: form.goal, activity: form.activity,
      ...(form.heightCm ? { heightCm: form.heightCm } : {}),
      ...(form.weightKg ? { weightKg: form.weightKg } : {}),
      ...(form.age ? { age: form.age } : {}),
      ...(form.sex ? { sex: form.sex } : {}),
      extras: JSON.stringify(ex),
    };
    update.mutate(payload, { onSuccess: () => setSaved(true) });
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 02</div>
      <h1 style={{ fontSize: 26 }}>Food Preference Profile 🌿</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Your taste, your health goals, your budget — behind every meal plan and recipe.
      </p>

      <form onSubmit={submit}>
        {/* 1 · Cuisine mix */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Cuisine mix</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>Which kitchens should your plans lean on?</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CUISINES.map((c) => (
              <Chip key={c} on={(ex.cuisines ?? []).includes(c)} onClick={() => setEx({ ...ex, cuisines: toggle(ex.cuisines, c) })}>{c}</Chip>
            ))}
          </div>
        </div>

        {/* 2 · Dietary preference */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Dietary preference</div>
          <span style={label}>Diet pattern</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DIETS.map((d) => {
              const meta = d.key !== 'everything' ? DIET_META[d.key as keyof typeof DIET_META] : null;
              const active = form.diet === d.key;
              return (
                <button key={d.key} type="button" onClick={() => setForm({ ...form, diet: d.key })}
                  style={{
                    cursor: 'pointer', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                    border: `1.5px solid ${meta ? meta.color : 'var(--line)'}`,
                    background: active ? (meta ? meta.color : 'var(--accent)') : (meta ? meta.soft : 'transparent'),
                    color: active ? '#fff' : meta ? meta.color : 'var(--ink-soft)',
                  }}>{d.label}</button>
              );
            })}
          </div>
          <span style={label}>Protein sources</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PROTEINS.map((p) => (
              <Chip key={p} on={(ex.proteins ?? []).includes(p)} onClick={() => setEx({ ...ex, proteins: toggle(ex.proteins, p) })}>{p}</Chip>
            ))}
          </div>
          <span style={label}>Meats you eat</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MEATS.map((m) => (
              <Chip key={m} on={(ex.meats ?? []).includes(m)} onClick={() => setEx({ ...ex, meats: toggle(ex.meats, m) })}>{m}</Chip>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Only these will appear in your plans.</p>
        </div>

        {/* 3 · Weekly religious planning */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Weekly planning</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>Set veg or non-veg days (e.g. for fasting or religious days).</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))', gap: 8 }}>
            {DAYS.map((d) => {
              const v = ex.weekly?.[d] ?? 'veg';
              return (
                <div key={d} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>{d}</div>
                  <button type="button" onClick={() => setWeekly(d, v === 'veg' ? 'nonveg' : 'veg')}
                    style={{ width: '100%', cursor: 'pointer', borderRadius: 10, padding: '7px 0', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                      border: `1.5px solid ${v === 'veg' ? '#2e7d32' : '#c62828'}`, background: v === 'veg' ? '#e8f5e9' : '#ffebee', color: v === 'veg' ? '#2e7d32' : '#c62828' }}>
                    {v === 'veg' ? 'Veg' : 'Non-veg'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 · Allergies & foods */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Allergies &amp; foods</div>
          <span style={label}>Allergies (hard exclusion)</span>
          <input value={ex.allergies ?? ''} placeholder="e.g. peanuts, shellfish, gluten"
            onChange={(e) => setEx({ ...ex, allergies: e.target.value })} style={field} />
          <span style={label}>Foods you don’t eat</span>
          <input value={ex.excluded ?? ''} placeholder="e.g. mushrooms, brinjal"
            onChange={(e) => setEx({ ...ex, excluded: e.target.value })} style={field} />
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Recipes containing these will never be shown to you.</p>
        </div>

        {/* 5 · Health & goals */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Health &amp; goals</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div>
              <span style={label}>Age</span>
              <input type="number" min={10} max={120} value={form.age ?? ''} placeholder="30"
                onChange={(e) => setForm({ ...form, age: num(e.target.value) })} style={field} />
            </div>
            <div>
              <span style={label}>Sex</span>
              <select value={form.sex ?? ''} onChange={(e) => setForm({ ...form, sex: (e.target.value || null) as FoodPref['sex'] })} style={field}>
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            <div>
              <span style={label}>Height (cm)</span>
              <input type="number" min={80} max={250} value={form.heightCm ?? ''} placeholder="172"
                onChange={(e) => setForm({ ...form, heightCm: num(e.target.value) })} style={field} />
            </div>
            <div>
              <span style={label}>Weight (kg)</span>
              <input type="number" min={25} max={400} value={form.weightKg ?? ''} placeholder="70"
                onChange={(e) => setForm({ ...form, weightKg: num(e.target.value) })} style={field} />
            </div>
          </div>

          <span style={label}>Activity level</span>
          <select value={form.activity} onChange={(e) => setForm({ ...form, activity: parseFloat(e.target.value) })} style={field}>
            {ACTIVITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>

          <span style={label}>Goal</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['lose', 'maintain', 'gain'] as const).map((g) => (
              <button key={g} type="button" onClick={() => setForm({ ...form, goal: g })}
                style={{ flex: 1, cursor: 'pointer', borderRadius: 12, padding: '10px 0', fontSize: 13, fontFamily: 'inherit',
                  border: '1.5px solid var(--line)', fontWeight: form.goal === g ? 700 : 400,
                  background: form.goal === g ? 'var(--accent)' : 'transparent', color: form.goal === g ? '#fff' : 'var(--ink-soft)' }}>
                {g === 'lose' ? 'Weight loss' : g === 'gain' ? 'Muscle gain' : 'Maintain'}
              </button>
            ))}
          </div>

          <span style={label}>Nutrition pattern</span>
          <select value={ex.pattern ?? 'Balanced'} onChange={(e) => setEx({ ...ex, pattern: e.target.value })} style={field}>
            {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div>
              <span style={label}>Max cook time (min)</span>
              <input type="number" min={5} max={240} value={ex.maxCookMin ?? ''} placeholder="45"
                onChange={(e) => setEx({ ...ex, maxCookMin: num(e.target.value) })} style={field} />
            </div>
            <div>
              <span style={label}>Medical conditions</span>
              <input value={ex.conditions ?? ''} placeholder="e.g. diabetes, PCOS"
                onChange={(e) => setEx({ ...ex, conditions: e.target.value })} style={field} />
            </div>
          </div>
        </div>

        {/* 6 · Grocery budget & 7 · Delivery */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Budget &amp; delivery</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div>
              <span style={label}>Grocery budget (₹/day per person)</span>
              <input type="number" min={50} max={5000} value={ex.budgetInr ?? ''} placeholder="500"
                onChange={(e) => setEx({ ...ex, budgetInr: num(e.target.value) })} style={field} />
            </div>
            <div>
              <span style={label}>Delivery schedule</span>
              <select value={ex.delivery ?? ''} onChange={(e) => setEx({ ...ex, delivery: e.target.value })} style={field}>
                <option value="">—</option>
                {DELIVERY.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <Button type="submit" variant="accent" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save preferences'}
          </Button>
          {saved && !update.isPending && <span className="muted" style={{ fontSize: 12.5 }}>Saved — targets updated ✓</span>}
        </div>
      </form>

      <TargetsCard />

      <p className="muted" style={{ fontSize: 11.5, marginTop: 16, textAlign: 'center' }}>
        Personalised for you · Expert guidance · Quality you can trust · Better every day
      </p>
    </div>
  );
}

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
  { value: 1.4, label: 'Light — walks, errands' },
  { value: 1.6, label: 'Moderate — 3–4 workouts/week' },
  { value: 1.8, label: 'Active — daily training' },
  { value: 2.0, label: 'Athlete — hard training' },
];

const field: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--card)',
};
const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--muted)', display: 'block', margin: '14px 0 6px',
};

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

/** Food Preference Profile — taste, goals and body stats behind the targets engine. */
export function Preferences() {
  const existing = useFoodPref();
  const update = useUpdateFoodPref();
  const [form, setForm] = useState<FoodPref | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (existing.data && !form) setForm(existing.data); }, [existing.data, form]);

  if (existing.isLoading || !form) return <Spinner label="Loading your preferences…" />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Partial<FoodPref> = {
      diet: form.diet, goal: form.goal, activity: form.activity,
      ...(form.heightCm ? { heightCm: form.heightCm } : {}),
      ...(form.weightKg ? { weightKg: form.weightKg } : {}),
      ...(form.age ? { age: form.age } : {}),
      ...(form.sex ? { sex: form.sex } : {}),
    };
    update.mutate(payload, { onSuccess: () => setSaved(true) });
  };

  const num = (v: string) => (v ? parseInt(v, 10) : null);

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · Preferences</div>
      <h1 style={{ fontSize: 26 }}>Food Preference Profile</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Your diet shapes every plan; your body stats set the targets.
      </p>

      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <span style={label}>Diet identity</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DIETS.map((d) => {
            const meta = d.key !== 'everything' ? DIET_META[d.key as keyof typeof DIET_META] : null;
            const active = form.diet === d.key;
            return (
              <button
                key={d.key} type="button" onClick={() => setForm({ ...form, diet: d.key })}
                style={{
                  cursor: 'pointer', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                  border: `1.5px solid ${meta ? meta.color : 'var(--line)'}`,
                  background: active ? (meta ? meta.color : 'var(--accent)') : (meta ? meta.soft : 'transparent'),
                  color: active ? '#fff' : meta ? meta.color : 'var(--ink-soft)',
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <span style={label}>Goal</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['lose', 'maintain', 'gain'] as const).map((g) => (
            <button
              key={g} type="button" onClick={() => setForm({ ...form, goal: g })}
              style={{
                flex: 1, cursor: 'pointer', borderRadius: 12, padding: '10px 0', fontSize: 13, fontFamily: 'inherit',
                border: '1.5px solid var(--line)', fontWeight: form.goal === g ? 700 : 400,
                background: form.goal === g ? 'var(--accent)' : 'transparent',
                color: form.goal === g ? '#fff' : 'var(--ink-soft)', textTransform: 'capitalize',
              }}
            >
              {g === 'lose' ? 'Lose weight' : g === 'gain' ? 'Gain muscle' : 'Maintain'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
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
          <div>
            <span style={label}>Age</span>
            <input type="number" min={10} max={120} value={form.age ?? ''} placeholder="30"
              onChange={(e) => setForm({ ...form, age: num(e.target.value) })} style={field} />
          </div>
          <div>
            <span style={label}>Sex</span>
            <select value={form.sex ?? ''} onChange={(e) => setForm({ ...form, sex: (e.target.value || null) as FoodPref['sex'] })} style={field}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <span style={label}>Activity level</span>
        <select value={form.activity} onChange={(e) => setForm({ ...form, activity: parseFloat(e.target.value) })} style={field}>
          {ACTIVITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <Button type="submit" variant="accent" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save preferences'}
          </Button>
          {saved && !update.isPending && <span className="muted" style={{ fontSize: 12.5 }}>Saved — targets updated ✓</span>}
        </div>
      </form>

      <TargetsCard />
    </div>
  );
}

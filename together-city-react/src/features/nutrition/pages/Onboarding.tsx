import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useFoodPref, useUpdateFoodPref } from '../hooks';
import type { FoodPref } from '../api';

/* ─────────────── options (single source, token-styled) ─────────────── */
const DIETS: { key: string; label: string }[] = [
  { key: 'veg', label: 'Vegetarian' }, { key: 'vegan', label: 'Vegan' },
  { key: 'nonveg', label: 'Non-Vegetarian' }, { key: 'egg', label: 'Eggetarian' }, { key: 'jain', label: 'Jain' },
];
const GOALS: { key: 'lose' | 'maintain' | 'gain'; label: string }[] = [
  { key: 'lose', label: 'Lose weight' }, { key: 'maintain', label: 'Maintain' }, { key: 'gain', label: 'Gain muscle' },
];
const ACTIVITY: { value: number; label: string }[] = [
  { value: 1.2, label: 'Sedentary' }, { value: 1.4, label: 'Lightly active' }, { value: 1.6, label: 'Active' }, { value: 1.9, label: 'Very active' },
];
const PROTEINS_BY_DIET: Record<string, string[]> = {
  veg: ['Paneer', 'Tofu', 'Lentils', 'Chickpeas', 'Beans', 'Curd', 'Milk'],
  jain: ['Paneer', 'Tofu', 'Lentils', 'Chickpeas', 'Beans', 'Curd'],
  vegan: ['Tofu', 'Lentils', 'Chickpeas', 'Beans', 'Soya'],
  egg: ['Eggs', 'Paneer', 'Tofu', 'Lentils', 'Chickpeas'],
  nonveg: ['Chicken', 'Fish', 'Mutton', 'Eggs', 'Prawns', 'Paneer'],
};
const CUISINES = ['Indian', 'Chinese', 'Italian', 'Thai', 'Continental', 'Mediterranean', 'Mexican', 'Japanese', 'American', 'Middle Eastern'];
const AVOID = ['Peanuts', 'Tree nuts', 'Shellfish', 'Dairy', 'Gluten', 'Soy', 'Egg', 'Mushrooms', 'Onion', 'Garlic'];

const STEPS = ['About you', 'Your diet', 'Protein sources', 'Cuisines', 'Foods to avoid'];

/* ─────────────── token-styled atoms ─────────────── */
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 24, boxShadow: 'var(--shadow)' };
const field: React.CSSProperties = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 12px', fontSize: 15, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6, display: 'block' };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '9px 16px', borderRadius: 999,
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'var(--card)', color: on ? '#fff' : 'var(--ink-soft)' }}>
      {children}
    </button>
  );
}

/**
 * Nutrition onboarding — a 5-step wizard that CREATES the user's permanent
 * nutrition profile. Everything entered here is saved to the Food Preference
 * Profile (source of truth for meal generation) + the body/goal fields the
 * Health Profile uses for targets. Nothing is discarded; profiles open collapsed
 * afterwards and are edited only via "Edit".
 */
export function Onboarding() {
  const navigate = useNavigate();
  const existing = useFoodPref();
  const update = useUpdateFoodPref();

  const [step, setStep] = useState(0);
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState(1.4);
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain');
  const [diet, setDiet] = useState('veg');
  const [proteins, setProteins] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>(['Indian']);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [allergies, setAllergies] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from an existing profile so onboarding EDITS rather than re-asks.
  useEffect(() => {
    if (existing.data && !prefilled) {
      const d = existing.data;
      if (d.age) setAge(String(d.age));
      if (d.sex) setSex(d.sex);
      if (d.heightCm) setHeight(String(d.heightCm));
      if (d.weightKg) setWeight(String(d.weightKg));
      if (d.activity) setActivity(d.activity);
      if (d.goal) setGoal(d.goal);
      if (d.diet) setDiet(d.diet);
      try {
        const ex = d.extras ? JSON.parse(d.extras) : {};
        if (ex.proteins?.length) setProteins(ex.proteins);
        if (ex.cuisines?.length) setCuisines(ex.cuisines);
        else if (ex.cuisineMix) setCuisines(Object.keys(ex.cuisineMix));
        if (ex.excluded) setAvoid(String(ex.excluded).split(',').map((s: string) => s.trim()).filter(Boolean));
        if (ex.allergies) setAllergies(ex.allergies);
      } catch { /* ignore */ }
      setPrefilled(true);
    }
  }, [existing.data, prefilled]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const proteinOpts = PROTEINS_BY_DIET[diet] ?? PROTEINS_BY_DIET.veg;
  const bodyOk = age !== '' && sex !== '' && height !== '' && weight !== '';
  const canNext = step === 0 ? bodyOk : true;

  const finish = () => {
    const cuisineMix = cuisines.length ? Object.fromEntries(cuisines.map((c) => [c, Math.round(100 / cuisines.length)])) : {};
    const exToSave = {
      proteins, meats: [], cuisines, cuisineMix,
      excluded: avoid.join(', '), allergies,
      healthConditions: [], conditions: '',
    };
    const payload: Partial<FoodPref> = {
      diet, goal, activity,
      heightCm: Number(height) || null, weightKg: Number(weight) || null,
      age: Number(age) || null, sex: sex || null,
      extras: JSON.stringify(exToSave),
    } as Partial<FoodPref>;
    update.mutate(payload, { onSuccess: () => navigate('/nutrition/weekly') });
  };

  if (existing.isLoading) return <Spinner label="Loading your profile…" />;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="eyebrow">Nutrition Hub · Onboarding</div>
      <h1 style={{ fontSize: 28, margin: '4px 0 6px' }}>Create your nutrition profile</h1>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
        Five quick steps. Everything you enter is saved to your profile and drives every meal plan, grocery list and recipe — you won't be asked again.
      </p>

      {/* progress */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 3, background: i <= step ? 'var(--accent)' : 'var(--line)' }} />
            <div style={{ fontSize: 11.5, marginTop: 6, color: i === step ? 'var(--accent)' : 'var(--muted)', fontWeight: i === step ? 700 : 500 }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        {step === 0 && (
          <>
            <h2 style={{ fontSize: 18, margin: '0 0 16px' }}>About you</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div><label style={labelStyle}>Age</label><input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} style={field} placeholder="e.g. 32" /></div>
              <div><label style={labelStyle}>Sex</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Chip on={sex === 'male'} onClick={() => setSex('male')}>Male</Chip>
                  <Chip on={sex === 'female'} onClick={() => setSex('female')}>Female</Chip>
                </div>
              </div>
              <div><label style={labelStyle}>Height (cm)</label><input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} style={field} placeholder="e.g. 175" /></div>
              <div><label style={labelStyle}>Weight (kg)</label><input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, ''))} style={field} placeholder="e.g. 70" /></div>
            </div>
            <label style={labelStyle}>Activity level</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {ACTIVITY.map((a) => <Chip key={a.value} on={activity === a.value} onClick={() => setActivity(a.value)}>{a.label}</Chip>)}
            </div>
            <label style={labelStyle}>Your goal</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GOALS.map((g) => <Chip key={g.key} on={goal === g.key} onClick={() => setGoal(g.key)}>{g.label}</Chip>)}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Your diet</h2>
            <p className="muted" style={{ fontSize: 13.5, margin: '0 0 16px' }}>This is the base rule every meal follows.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DIETS.map((d) => <Chip key={d.key} on={diet === d.key} onClick={() => { setDiet(d.key); setProteins([]); }}>{d.label}</Chip>)}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Protein sources</h2>
            <p className="muted" style={{ fontSize: 13.5, margin: '0 0 16px' }}>Pick the proteins you actually eat — your plans lean on these.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {proteinOpts.map((p) => <Chip key={p} on={proteins.includes(p)} onClick={() => toggle(proteins, setProteins, p)}>{p}</Chip>)}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Preferred cuisines</h2>
            <p className="muted" style={{ fontSize: 13.5, margin: '0 0 16px' }}>Your plans draw mainly from these.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CUISINES.map((c) => <Chip key={c} on={cuisines.includes(c)} onClick={() => toggle(cuisines, setCuisines, c)}>{c}</Chip>)}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Foods to avoid</h2>
            <p className="muted" style={{ fontSize: 13.5, margin: '0 0 16px' }}>Allergies and dislikes — every plan avoids these automatically.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {AVOID.map((a) => <Chip key={a} on={avoid.includes(a)} onClick={() => toggle(avoid, setAvoid, a)}>{a}</Chip>)}
            </div>
            <label style={labelStyle}>Anything else to avoid (optional)</label>
            <input value={allergies} onChange={(e) => setAllergies(e.target.value)} style={field} placeholder="e.g. brinjal, prawns" />
            <p className="muted" style={{ fontSize: 13, margin: '16px 0 0', lineHeight: 1.5 }}>
              Have a blood report? <Link to="/nutrition/blood" style={{ color: 'var(--accent)', fontWeight: 600 }}>Connect it</Link> and your plan adapts to your biomarkers — you can do this any time.
            </p>
          </>
        )}
      </div>

      {/* nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18 }}>
        <Button variant="line" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</Button>
        {step < STEPS.length - 1
          ? <Button variant="accent" onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}>Next →</Button>
          : <Button variant="accent" onClick={finish} disabled={update.isPending || !bodyOk}>{update.isPending ? 'Saving…' : 'Save & create my plan →'}</Button>}
      </div>
      {step === 0 && !bodyOk && <p className="muted" style={{ fontSize: 12.5, marginTop: 8, textAlign: 'right' }}>Fill in age, sex, height and weight to continue.</p>}
    </div>
  );
}

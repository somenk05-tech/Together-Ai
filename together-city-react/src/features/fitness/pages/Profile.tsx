import { useEffect, useState } from 'react';
import { useFormValidation, ValidationSummary, successToast } from '@/components/form-validation';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useFitnessProfile, useSaveFitnessProfile } from '../api';

const GOALS = [
  { key: 'general', label: 'General health' }, { key: 'weightLoss', label: 'Weight loss' },
  { key: 'strength', label: 'Strength' }, { key: 'endurance', label: 'Endurance' },
];
const CONDITIONS = [
  { key: 'hypertension', label: 'High blood pressure' }, { key: 'diabetes', label: 'Diabetes' },
  { key: 'pregnancy', label: 'Pregnancy' }, { key: 'jointPain', label: 'Joint sensitivity' },
];
const SEX = [{ key: 'female', label: 'Female' }, { key: 'male', label: 'Male' }, { key: 'other', label: 'Prefer not to say' }];

function Choice({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 999, padding: '8px 15px', fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
        border: '1.5px solid var(--line)', background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' }}>
      {label}
    </button>
  );
}

/** Fitness Profile — age, ability (basic → super-athletic), modality, goal, conditions. */
export function Profile() {
  const profile = useFitnessProfile();
  const save = useSaveFitnessProfile();
  const [age, setAge] = useState(35);
  const [sex, setSex] = useState('other');
  const [level, setLevel] = useState('beginner');
  const [mode, setMode] = useState('mixed');
  const [goal, setGoal] = useState('general');
  const [conditions, setConditions] = useState<string[]>([]);
  const [heightCm, setHeightCm] = useState<number | ''>('');
  const [weightKg, setWeightKg] = useState<number | ''>('');
  const [bodyGoal, setBodyGoal] = useState('athletic');

  // Global validation standard — height & weight are required for real targets.
  const v = useFormValidation([
    { key: 'age', label: 'Age', valid: () => age >= 10 && age <= 100, message: 'Enter your Age (10–100).' },
    { key: 'height', label: 'Height', valid: () => heightCm !== '' && Number(heightCm) >= 100 && Number(heightCm) <= 250, message: 'Enter your Height (100–250 cm).' },
    { key: 'weight', label: 'Weight', valid: () => weightKg !== '' && Number(weightKg) >= 30 && Number(weightKg) <= 300, message: 'Enter your Weight (30–300 kg).' },
  ]);

  useEffect(() => {
    if (profile.data) {
      setAge(profile.data.age); setSex(profile.data.sex); setLevel(profile.data.level);
      setMode(profile.data.mode); setGoal(profile.data.goal); setConditions(profile.data.conditions);
      setHeightCm(profile.data.heightCm ?? ''); setWeightKg(profile.data.weightKg ?? ''); setBodyGoal(profile.data.bodyGoal ?? 'athletic');
    }
  }, [profile.data]);

  if (profile.isLoading) return <Spinner label="Loading your fitness profile…" />;
  if (profile.isError || !profile.data) return <EmptyState title="Couldn't load your profile" hint="Start the backend and reload." />;

  const { levels, modes, bodyGoals } = profile.data.options;
  const toggle = (k: string) => setConditions((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const num = (v: number | '') => (v === '' ? undefined : Number(v));

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Fitness · Profile</div>
      <h1 style={{ fontSize: 26 }}>Build your training profile</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        Your plan is shaped by your age and ability, then adjusted for any health conditions —
        and, with your consent, by your blood markers from the Medical Hub.
      </p>

      {!profile.data.saved && profile.data.prefilled && (
        <div style={{ marginBottom: 16, background: 'var(--accent-soft)', borderRadius: 12, padding: '11px 14px', fontSize: 13 }}>
          ✨ We pre-filled your age, gender, height and weight from your Together City profile. Just set your training preferences and save.
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">About you</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Age
            <input type="number" min={13} max={100} value={age} onChange={(e) => setAge(Number(e.target.value))}
              style={{ width: 72, padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {SEX.map((s) => <Choice key={s.key} on={sex === s.key} label={s.label} onClick={() => setSex(s.key)} />)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Ability level <span className="muted" style={{ fontWeight: 400 }}>· basic → super-athletic</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {levels.map((l) => <Choice key={l.key} on={level === l.key} label={l.label} onClick={() => setLevel(l.key)} />)}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{levels.find((l) => l.key === level)?.note}</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Training style</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {modes.map((m) => <Choice key={m.key} on={mode === m.key} label={m.label} onClick={() => setMode(m.key)} />)}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{modes.find((m) => m.key === mode)?.note}</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Goal</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {GOALS.map((g) => <Choice key={g.key} on={goal === g.key} label={g.label} onClick={() => setGoal(g.key)} />)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Health conditions <span className="muted" style={{ fontWeight: 400 }}>· we adjust for these</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {CONDITIONS.map((c) => <Choice key={c.key} on={conditions.includes(c.key)} label={c.label} onClick={() => toggle(c.key)} />)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--accent)' }}>
        <div className="eyebrow">Body goal <span className="muted" style={{ fontWeight: 400 }}>· target composition ({sex === 'female' ? 'women' : sex === 'male' ? 'men' : 'personalised'})</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8, marginTop: 10 }}>
          {bodyGoals.map((b) => (
            <button key={b.key} type="button" onClick={() => setBodyGoal(b.key)}
              style={{ cursor: 'pointer', textAlign: 'left', borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit',
                border: `1.5px solid ${bodyGoal === b.key ? 'var(--accent)' : 'var(--line)'}`, background: bodyGoal === b.key ? 'var(--accent-soft)' : 'transparent' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: bodyGoal === b.key ? 'var(--accent)' : 'var(--ink)' }}>{b.label}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{b.tag}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Height
            <input ref={(el) => v.reg('height')(el)} type="number" min={120} max={230} value={heightCm} onChange={(e) => { setHeightCm(e.target.value === '' ? '' : Number(e.target.value)); v.clear('height'); }} placeholder="cm"
              style={{ width: 84, padding: '8px 10px', border: `1.5px solid ${v.errors.height ? '#c0392b' : 'var(--line)'}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Weight
            <input ref={(el) => v.reg('weight')(el)} type="number" min={30} max={300} value={weightKg} onChange={(e) => { setWeightKg(e.target.value === '' ? '' : Number(e.target.value)); v.clear('weight'); }} placeholder="kg"
              style={{ width: 84, padding: '8px 10px', border: `1.5px solid ${v.errors.weight ? '#c0392b' : 'var(--line)'}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          </label>
          <span className="muted" style={{ fontSize: 11.5, alignSelf: 'center', maxWidth: 260 }}>Needed for your calorie & macro targets — used to build the diet plan.</span>
        </div>
      </div>

      <ValidationSummary missing={v.missing} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="accent" disabled={save.isPending}
          onClick={() => { if (!v.validate()) return; save.mutate({ age, sex, level, mode, goal, conditions, heightCm: num(heightCm), weightKg: num(weightKg), bodyGoal }, { onSuccess: () => successToast('Fitness profile saved successfully.') }); }}>
          {save.isPending ? 'Saving…' : 'Save & build my plan'}
        </Button>
        {save.isSuccess && <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>✓ Saved — see My Plan & Body Goal</span>}
      </div>
    </div>
  );
}

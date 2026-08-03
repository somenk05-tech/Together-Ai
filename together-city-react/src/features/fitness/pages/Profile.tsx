import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFormValidation, ValidationSummary, successToast } from '@/components/form-validation';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useFitnessProfile, useSaveFitnessProfile } from '../api';
import { useMasterProfile } from '@/features/profile/hooks';
import { MasterLockedNote, masterLockedStyle } from '@/features/profile/MasterLockedField';

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
        border: '1.5px solid var(--line)', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
      {label}
    </button>
  );
}

/** Fitness Profile — age, ability (basic → super-athletic), modality, goal, conditions. */
export function Profile() {
  const profile = useFitnessProfile();
  const master = useMasterProfile();
  const ageLocked = master.data?.age != null;
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
  const [collapsed, setCollapsed] = useState(false);

  // Global validation standard — height & weight are required for real targets.
  const v = useFormValidation([
    { key: 'age', label: 'Age', valid: () => age >= 10 && age <= 100, message: 'Enter your Age (10–100).' },
    { key: 'height', label: 'Height', valid: () => heightCm !== '' && Number(heightCm) >= 100 && Number(heightCm) <= 250, message: 'Enter your Height (100–250 cm).' },
    { key: 'weight', label: 'Weight', valid: () => weightKg !== '' && Number(weightKg) >= 30 && Number(weightKg) <= 300, message: 'Enter your Weight (30–300 kg).' },
  ]);

  useEffect(() => {
    if (!profile.data) return;
    const d = profile.data;
    const m = master.data;
    // Auto-fill shared fields from the Master Profile when this hub hasn't got
    // them yet (spec: read shared fields; never re-ask).
    setAge(m?.age ?? d.age);
    // `d.sex` is the server's prefill, which now resolves through clinicalSex().
    // The `m?.gender` fallback that used to sit here read the retired column —
    // and read the SOCIAL answer for a field that feeds a BMR equation.
    setSex(d.sex || (m?.resolvedSex ?? d.sex));
    setLevel(d.level); setMode(d.mode); setGoal(d.goal); setConditions(d.conditions);
    setHeightCm(d.heightCm ?? (m?.heightCm ?? '')); setWeightKg(d.weightKg ?? (m?.weightKg ?? '')); setBodyGoal(d.bodyGoal ?? 'athletic');
    // Already completed before → open as a compact summary, not the full form.
    setCollapsed(Boolean(d.heightCm && d.weightKg));
  }, [profile.data, master.data]);

  if (profile.isLoading) return <Spinner label="Loading your fitness profile…" />;
  if (profile.isError || !profile.data) return <EmptyState title="Couldn't load your profile" hint="Nothing you’ve entered has been lost — this didn’t reach us. Try again in a moment." />;

  const { levels, modes, bodyGoals } = profile.data.options;
  const toggle = (k: string) => setConditions((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const num = (v: number | '') => (v === '' ? undefined : Number(v));

  // Collapsed: a read-only summary card with an Edit button (spec: collapse
  // completed sections, keep them compact but easy to reopen).
  if (collapsed) {
    const rows: [string, string][] = [
      ['Age', String(age)],
      ['Sex', SEX.find((s) => s.key === sex)?.label ?? sex],
      ['Ability', levels.find((l) => l.key === level)?.label ?? level],
      ['Training style', modes.find((m) => m.key === mode)?.label ?? mode],
      ['Goal', GOALS.find((g) => g.key === goal)?.label ?? goal],
      ['Body goal', bodyGoals.find((b) => b.key === bodyGoal)?.label ?? bodyGoal],
      ['Height', heightCm ? `${heightCm} cm` : '—'],
      ['Weight', weightKg ? `${weightKg} kg` : '—'],
      ['Conditions', conditions.length ? conditions.map((c) => CONDITIONS.find((x) => x.key === c)?.label ?? c).join(', ') : 'None'],
    ];
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
        <div className="eyebrow">Fitness · Profile</div>
        <h1 style={{ fontSize: 26 }}>Your training profile</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Training profile</h3>
            <Button variant="line" size="sm" onClick={() => setCollapsed(false)}>Edit</Button>
          </div>
          {rows.map(([k, val]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
              <span className="muted" style={{ fontSize: 12.5, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 13, textAlign: 'right' }}>{val}</span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>Shared details (age, height, weight) also live in your <Link to="/profile" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Master Profile</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Fitness · Profile</div>
      <h1 style={{ fontSize: 26 }}>Build your training profile</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        Your plan is shaped by your age and ability, then adjusted for any health conditions —
        and, with your consent, by your blood markers from the Medical Hub.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">About you</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Age
            <input type="number" min={13} max={100} value={age} onChange={(e) => setAge(Number(e.target.value))}
              disabled={ageLocked} title={ageLocked ? 'Set in your Master Profile' : undefined}
              style={{ width: 72, padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', ...(ageLocked ? masterLockedStyle : {}) }} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {SEX.map((s) => <Choice key={s.key} on={sex === s.key} label={s.label} onClick={() => setSex(s.key)} />)}
          </div>
        </div>
        {ageLocked && <MasterLockedNote label="Age" />}
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
              style={{ width: 84, padding: '8px 10px', border: `1.5px solid ${v.errors.height ? 'var(--danger-ink)' : 'var(--line)'}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Weight
            <input ref={(el) => v.reg('weight')(el)} type="number" min={30} max={300} value={weightKg} onChange={(e) => { setWeightKg(e.target.value === '' ? '' : Number(e.target.value)); v.clear('weight'); }} placeholder="kg"
              style={{ width: 84, padding: '8px 10px', border: `1.5px solid ${v.errors.weight ? 'var(--danger-ink)' : 'var(--line)'}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          </label>
          <span className="muted" style={{ fontSize: 11.5, alignSelf: 'center', maxWidth: 260 }}>Needed for your calorie & macro targets — used to build the diet plan.</span>
        </div>
      </div>

      <ValidationSummary missing={v.missing} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="accent" disabled={save.isPending}
          onClick={() => { if (!v.validate()) return; save.mutate({ age, sex, level, mode, goal, conditions, heightCm: num(heightCm), weightKg: num(weightKg), bodyGoal }, { onSuccess: () => { setCollapsed(true); successToast('Fitness profile saved successfully.'); } }); }}>
          {save.isPending ? 'Saving…' : 'Save & build my plan'}
        </Button>
        {save.isSuccess && <span style={{ fontSize: 13, color: 'var(--accent-ink)', fontWeight: 700 }}>✓ Saved — see My Plan & Body Goal</span>}
      </div>
    </div>
  );
}

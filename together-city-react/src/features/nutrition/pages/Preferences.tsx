import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useFoodPref, useNutritionTargets, useUpdateFoodPref } from '../hooks';
import { useBloodHistory } from '@/features/medical/api';
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
// One unified protein list (meats + eggs + plant proteins) — the single source of
// truth for what a user eats. No separate "Meats you eat" box to contradict it.
const PROTEINS = ['Chicken', 'Mutton', 'Fish', 'Prawns', 'Beef', 'Pork', 'Egg', 'Paneer', 'Tofu', 'Legumes'];

// Which proteins each diet may pick from. Veg/vegan/jain never see meat or fish;
// egg adds eggs; fish (pescatarian) adds seafood only.
const PROTEINS_BY_DIET: Record<string, string[]> = {
  everything: PROTEINS,
  nonveg: PROTEINS,
  pesc: ['Fish', 'Prawns', 'Egg', 'Paneer', 'Tofu', 'Legumes'],
  egg: ['Egg', 'Paneer', 'Tofu', 'Legumes'],
  veg: ['Paneer', 'Tofu', 'Legumes'],
  vegan: ['Tofu', 'Legumes'],
  jain: ['Paneer', 'Tofu', 'Legumes'],
};
const PATTERNS = ['Balanced', 'High protein', 'Low carb', 'Keto', 'Mediterranean', 'Diabetic-friendly', 'Heart-healthy', 'Low sodium', 'Gluten-free', 'Lactose-free'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DELIVERY = ['Morning (6–9am)', 'Midday (12–2pm)', 'Evening (5–8pm)'];
const CONDITIONS = ['Diabetes', 'Hypertension', 'PCOS', 'Kidney Disease', 'Fatty Liver'];
const WELLNESS_GOALS = ['Lose Fat', 'Gain Muscle', 'Improve Gut Health', 'Improve Skin', 'Better Hair', 'Lower Cholesterol', 'Better Sleep', 'Higher Energy', 'Diabetes Control', 'Heart Health'];
// Auto-detected from a flagged blood marker → pre-selected concern/goal.
const COND_FROM_MARKER: Record<string, string> = { hba1c: 'Diabetes' };
const GOALS_FROM_MARKER: Record<string, string[]> = {
  hba1c: ['Diabetes Control'],
  ldl: ['Lower Cholesterol', 'Heart Health'],
  trig: ['Lower Cholesterol', 'Heart Health'],
  hb: ['Higher Energy'],
  ferritin: ['Higher Energy'],
};
const uniq = (a: string[]) => [...new Set(a)];

interface Extras {
  cuisines?: string[];               // legacy multi-select (migrated to cuisineMix)
  cuisineMix?: Record<string, number>; // cuisine → % share of the plan
  healthConditions?: string[];       // Diabetes, Hypertension, … (or none)
  equipment?: string[];              // kitchen equipment the user owns
  healthGoals?: string[];            // wellness goals (multi-select)
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
  const bloodHistory = useBloodHistory();
  const [form, setForm] = useState<FoodPref | null>(null);
  const [ex, setEx] = useState<Extras>({});
  const [saved, setSaved] = useState(false);
  const [dietChosen, setDietChosen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [exLoaded, setExLoaded] = useState(false);
  const detectedMerged = useRef(false);

  useEffect(() => {
    if (existing.data && !form) {
      setForm(existing.data);
      let parsed: Extras = {};
      try { parsed = existing.data.extras ? JSON.parse(existing.data.extras) : {}; } catch { parsed = {}; }
      // Migration: the old separate "Meats you eat" list is folded into the single
      // Protein sources list, so prior meat picks aren't lost and any hidden ones
      // (e.g. Fish) become visible for the user to keep or remove.
      if (parsed.meats?.length) {
        parsed = { ...parsed, proteins: [...new Set([...(parsed.proteins ?? []), ...parsed.meats])], meats: [] };
      }
      setEx(parsed);
      // Returning users who've already configured proteins see the full form.
      setDietChosen(Boolean(parsed.proteins?.length));
      setExLoaded(true);
    }
  }, [existing.data, form]);

  // Pre-select health conditions + goals from the latest blood panel (once, after
  // the saved profile has loaded) — "if there's blood data, feed it in; else the
  // user picks." Blood-derived picks are merged on top of anything already saved.
  useEffect(() => {
    if (detectedMerged.current || !exLoaded) return;
    const t = (bloodHistory.data ?? []).slice().sort((a, b) => (a.takenOn < b.takenOn ? 1 : -1));
    if (!t.length) return; // wait for panels to load
    detectedMerged.current = true;
    const fl = t[0].flagged ?? [];
    const dc = uniq(fl.map((f) => COND_FROM_MARKER[f.key]).filter((x): x is string => !!x));
    const dg = uniq(fl.flatMap((f) => GOALS_FROM_MARKER[f.key] ?? []));
    if (!dc.length && !dg.length) return;
    setEx((prev) => ({
      ...prev,
      healthConditions: uniq([...(prev.healthConditions ?? []), ...dc]),
      healthGoals: uniq([...(prev.healthGoals ?? []), ...dg]),
    }));
  }, [exLoaded, bloodHistory.data]);

  if (existing.isLoading || !form) return <Spinner label="Loading your preferences…" />;

  const num = (v: string) => (v ? parseInt(v, 10) : null);
  const toggle = (list: string[] | undefined, v: string): string[] => {
    const arr = list ?? [];
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  };
  const setWeekly = (day: string, val: 'veg' | 'nonveg') =>
    setEx({ ...ex, weekly: { ...(ex.weekly ?? {}), [day]: val } });

  // Multi-select with an exclusive "None" (empty list = none).
  const toggleMulti = (list: string[] | undefined, v: string): string[] => {
    const arr = list ?? [];
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  };
  const setMulti = (key: 'healthConditions' | 'equipment' | 'healthGoals', v: string) =>
    setEx({ ...ex, [key]: toggleMulti(ex[key], v) });

  // Blood test status (from the Medical hub).
  const tests = (bloodHistory.data ?? []).slice().sort((a, b) => (a.takenOn < b.takenOn ? 1 : -1));
  const bloodConnected = tests.length > 0;
  const flagged = tests[0]?.flagged ?? [];
  const detectedConditions = uniq(flagged.map((f) => COND_FROM_MARKER[f.key]).filter((x): x is string => !!x));
  const detectedGoals = uniq(flagged.flatMap((f) => GOALS_FROM_MARKER[f.key] ?? []));

  const chipGroup = (key: 'healthConditions' | 'equipment' | 'healthGoals', items: string[], detected: string[] = []) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((v) => <Chip key={v} on={(ex[key] ?? []).includes(v)} onClick={() => setMulti(key, v)}>{v}{detected.includes(v) ? ' 🩸' : ''}</Chip>)}
      <Chip on={(ex[key] ?? []).length === 0} onClick={() => setEx({ ...ex, [key]: [] })}>None</Chip>
    </div>
  );

  // Diet drives everything below it. Veg-type diets never see meat/fish, and
  // their weekly days are all vegetarian.
  const VEG_DIETS = ['veg', 'vegan', 'jain', 'egg'];
  const isVegDiet = VEG_DIETS.includes(form.diet);
  const shownProteins = PROTEINS.filter((p) => (PROTEINS_BY_DIET[form.diet] ?? PROTEINS).includes(p));
  const weeklyDefault: 'veg' | 'nonveg' = isVegDiet ? 'veg' : 'nonveg';
  const weeklyValue = (day: string): 'veg' | 'nonveg' => (isVegDiet ? 'veg' : ex.weekly?.[day] ?? weeklyDefault);

  // Picking a diet reveals the rest and prunes now-disallowed choices.
  const chooseDiet = (key: string) => {
    const pa = PROTEINS_BY_DIET[key] ?? PROTEINS;
    setForm({ ...form, diet: key });
    // Prune now-disallowed proteins; meats are folded into proteins (no separate list).
    setEx({ ...ex, proteins: (ex.proteins ?? []).filter((p) => pa.includes(p)), meats: [] });
    setDietChosen(true);
  };

  // Cuisine mix (%). Fall back to an even split of the legacy `cuisines` list.
  const mix: Record<string, number> = ex.cuisineMix
    ?? (ex.cuisines && ex.cuisines.length
      ? Object.fromEntries(ex.cuisines.map((c) => [c, Math.round(100 / ex.cuisines!.length)]))
      : {});
  const mixTotal = CUISINES.reduce((sum, c) => sum + (mix[c] ?? 0), 0);
  const setMix = (nextMix: Record<string, number>) => {
    const cleaned = Object.fromEntries(Object.entries(nextMix).filter(([, v]) => v > 0));
    setEx({ ...ex, cuisineMix: cleaned, cuisines: Object.keys(cleaned) });
  };
  const setPct = (c: string, v: number) => {
    // Total can never exceed 100% — cap this slider at whatever's left.
    const others = mixTotal - (mix[c] ?? 0);
    const capped = Math.max(0, Math.min(v, 100 - others));
    setMix({ ...mix, [c]: capped });
  };
  const balanceMix = () => {
    const active = CUISINES.filter((c) => (mix[c] ?? 0) > 0);
    const list = active.length ? active : CUISINES;
    const each = Math.floor(100 / list.length);
    const next: Record<string, number> = {};
    list.forEach((c, i) => { next[c] = each + (i < 100 - each * list.length ? 1 : 0); });
    setMix(next);
  };

  // Read-only summary shown after saving (the page collapses to this).
  const dietLabel = DIETS.find((d) => d.key === form.diet)?.label ?? form.diet;
  const goalLabel = ({ lose: 'Weight loss', maintain: 'Maintain', gain: 'Muscle gain' } as const)[form.goal];
  const actLabel = ACTIVITY.find((a) => a.value === form.activity)?.label ?? '—';
  const cuisineSummary = Object.entries(mix).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}%`).join(' · ') || 'Broad mix';
  const nonvegDays = isVegDiet ? [] : DAYS.filter((d) => weeklyValue(d) === 'nonveg');
  const weeklySummary = isVegDiet || nonvegDays.length === 0 ? 'All veg' : nonvegDays.length === 7 ? 'All non-veg' : `Non-veg: ${nonvegDays.join(', ')}`;
  const bodySummary = [form.age && `${form.age}y`, form.sex, form.heightCm && `${form.heightCm}cm`, form.weightKg && `${form.weightKg}kg`].filter(Boolean).join(' · ') || 'Not set';
  const summaryRows: [string, string][] = [
    ['Diet', dietLabel],
    ['Goal', goalLabel],
    ['Health goals', (ex.healthGoals ?? []).join(', ') || '—'],
    ['Conditions', (ex.healthConditions ?? []).join(', ') || 'None'],
    ['Blood test', bloodConnected ? 'Connected' : 'Not connected'],
    ['Cuisine mix', cuisineSummary],
    ['Protein sources', (ex.proteins ?? []).join(', ') || '—'],
    ['Weekly', weeklySummary],
    ['Nutrition pattern', ex.pattern ?? 'Balanced'],
    ['Activity', actLabel],
    ['Allergies', ex.allergies || 'None'],
    ['Avoids', ex.excluded || 'None'],
    ['Budget', ex.budgetInr ? `₹${ex.budgetInr}/day` : '—'],
    ['Body', bodySummary],
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    // Persist a diet-consistent profile: veg diets store all-veg weekly days.
    // Mirror the condition chips into the legacy `conditions` string so the
    // planner / AI / profile keep reading a single field.
    const exToSave: Extras = {
      ...ex,
      meats: [], // merged into `proteins` — single source of truth, never a second list
      conditions: (ex.healthConditions ?? []).join(', '),
      ...(isVegDiet ? { weekly: Object.fromEntries(DAYS.map((d) => [d, 'veg' as const])) } : {}),
    };
    const payload: Partial<FoodPref> = {
      diet: form.diet, goal: form.goal, activity: form.activity,
      ...(form.heightCm ? { heightCm: form.heightCm } : {}),
      ...(form.weightKg ? { weightKg: form.weightKg } : {}),
      ...(form.age ? { age: form.age } : {}),
      ...(form.sex ? { sex: form.sex } : {}),
      extras: JSON.stringify(exToSave),
    };
    update.mutate(payload, { onSuccess: () => { setSaved(true); setCollapsed(true); } });
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 02</div>
      <h1 style={{ fontSize: 26 }}>Food Preference Profile 🌿</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Your taste, your health goals, your budget — behind every meal plan and recipe.
      </p>

      {collapsed && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div className="eyebrow" style={{ color: 'var(--accent)' }}>Saved ✓</div>
              <h3 style={{ margin: '2px 0 0' }}>Your food profile</h3>
            </div>
            <Button type="button" variant="line" size="sm" onClick={() => { setCollapsed(false); setSaved(false); }}>Edit</Button>
          </div>
          <div style={{ marginTop: 12 }}>
            {summaryRows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                <span className="muted" style={{ fontSize: 12.5, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 13, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            This profile powers your meal plans, recipes and your <Link to="/fitness/workout" style={{ color: 'var(--accent)', fontWeight: 600 }}>Fitness hub</Link> — and appears on your <Link to="/profile" style={{ color: 'var(--accent)', fontWeight: 600 }}>profile</Link>.
          </p>
        </div>
      )}

      <form onSubmit={submit} style={{ display: collapsed ? 'none' : 'block' }}>
        {/* 0 · Blood test status (from Medical hub) */}
        <div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="eyebrow">Health profile</div>
            {bloodConnected ? (
              <p style={{ fontSize: 14, margin: '4px 0 0', fontWeight: 600, color: '#2e7d32' }}>✓ Blood test connected</p>
            ) : (
              <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>Connect a blood test so your plans adapt to your biomarkers.</p>
            )}
          </div>
          {!bloodConnected && <Link to="/medical/blood"><Button type="button" variant="accent" size="sm">Connect blood test →</Button></Link>}
        </div>

        {/* 1 · Cuisine mix */}
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div className="eyebrow">Cuisine mix</div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: mixTotal === 100 ? 'var(--accent)' : mixTotal === 0 ? 'var(--muted)' : '#b8860b' }}>
              {mixTotal}% {mixTotal === 100 ? '✓' : 'of 100%'}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
            Set how much of each kitchen your plans should lean on. Drag a slider up to give it a bigger share of your weekly meals.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CUISINES.map((c) => {
              const v = mix[c] ?? 0;
              return (
                <div key={c} style={{ display: 'grid', gridTemplateColumns: '116px 1fr 40px', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: v > 0 ? 'var(--ink)' : 'var(--muted)' }}>{c}</span>
                  <input type="range" min={0} max={100} step={5} value={v}
                    onChange={(e) => setPct(c, Number(e.target.value))}
                    aria-label={`${c} share`}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                  <span style={{ fontSize: 12.5, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: v > 0 ? 'var(--accent)' : 'var(--muted)' }}>{v}%</span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button type="button" onClick={balanceMix}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)' }}>
              ⚖ Balance to 100%
            </button>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {mixTotal === 0 ? 'No preference — plans use a broad mix.'
                : mixTotal === 100 ? 'Perfectly balanced.'
                : `${100 - mixTotal}% left to assign.`}
            </span>
          </div>
        </div>

        {/* 2 · Dietary preference */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Dietary preference</div>
          <span style={label}>Diet pattern</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DIETS.map((d) => {
              const meta = d.key !== 'everything' ? DIET_META[d.key as keyof typeof DIET_META] : null;
              const active = dietChosen && form.diet === d.key;
              const color = meta ? meta.color : 'var(--ink)';
              return (
                <button key={d.key} type="button" onClick={() => chooseDiet(d.key)}
                  style={{
                    cursor: 'pointer', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: active ? 700 : 600,
                    border: `1.5px solid ${active ? color : 'var(--line)'}`,
                    background: active ? color : 'transparent',
                    color: active ? '#fff' : 'var(--ink)',
                  }}>{d.label}</button>
              );
            })}
          </div>

          {!dietChosen ? (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Pick your diet above to choose your protein sources.</p>
          ) : (
            <>
              <span style={label}>Protein sources</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {shownProteins.map((p) => (
                  <Chip key={p} on={(ex.proteins ?? []).includes(p)} onClick={() => setEx({ ...ex, proteins: toggle(ex.proteins, p) })}>{p}</Chip>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                {isVegDiet ? 'Your plan is fully vegetarian — only these will appear.' : 'Only the proteins you pick here will appear in your plans.'}
              </p>
            </>
          )}
        </div>

        {/* 3 · Weekly religious planning */}
        {dietChosen && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="eyebrow">Weekly planning</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
              {isVegDiet
                ? 'Your diet is vegetarian, so every day is set to veg.'
                : 'Set veg or non-veg days (e.g. for fasting or religious days). Defaults to your diet.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))', gap: 8 }}>
              {DAYS.map((d) => {
                const v = weeklyValue(d);
                return (
                  <div key={d} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>{d}</div>
                    <button type="button" disabled={isVegDiet} onClick={() => setWeekly(d, v === 'veg' ? 'nonveg' : 'veg')}
                      style={{ width: '100%', cursor: isVegDiet ? 'default' : 'pointer', opacity: isVegDiet ? 0.75 : 1, borderRadius: 10, padding: '7px 0', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                        border: `1.5px solid ${v === 'veg' ? '#2e7d32' : '#c62828'}`, background: v === 'veg' ? '#e8f5e9' : '#ffebee', color: v === 'veg' ? '#2e7d32' : '#c62828' }}>
                      {v === 'veg' ? 'Veg' : 'Non-veg'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

        {/* 4b · Health conditions */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Health conditions</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
            {bloodConnected
              ? '🩸 marks concerns we detected from your blood test — pre-selected for you. Add any others you know of. We use these to safely filter recipes and adjust your plan. Private to you.'
              : 'We use these to safely filter recipes and adjust your plan. Private to you.'}
          </p>
          {chipGroup('healthConditions', CONDITIONS, detectedConditions)}
        </div>

        {/* 4d · Health goals (multi-select wellness goals) */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Health goals</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
            {bloodConnected
              ? '🩸 marks goals your blood test points to — pre-selected. Add anything else you’re working towards; plans and recipes lean this way.'
              : 'Pick everything you’re working towards — plans and recipes lean this way.'}
          </p>
          {chipGroup('healthGoals', WELLNESS_GOALS, detectedGoals)}
        </div>

        {/* 5 · Health & goals */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Body &amp; targets</div>
          <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0' }}>
            🔗 Shared with your <Link to="/fitness/workout" style={{ color: 'var(--accent)', fontWeight: 600 }}>Fitness hub</Link> — set your body stats once here and workouts use them automatically.
          </p>
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

          <div>
            <span style={label}>Max cook time (min)</span>
            <input type="number" min={5} max={240} value={ex.maxCookMin ?? ''} placeholder="45"
              onChange={(e) => setEx({ ...ex, maxCookMin: num(e.target.value) })} style={field} />
            <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Health conditions moved to their own section above.</p>
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

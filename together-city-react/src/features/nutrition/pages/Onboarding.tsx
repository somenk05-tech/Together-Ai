import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

/** Diet-type options for the weekly matrix. */
const DIET_OPTS = ['Vegetarian', 'Vegan', 'Non-Veg', 'Egg', 'Jain', 'Skip'];
const MATRIX: { day: string; cells: string[] }[] = [
  { day: 'Mon', cells: ['Vegetarian', 'Vegetarian', 'Vegetarian', 'Vegetarian'] },
  { day: 'Tue', cells: ['Vegetarian', 'Vegan', 'Vegetarian', 'Vegetarian'] },
  { day: 'Wed', cells: ['Vegetarian', 'Vegetarian', 'Vegetarian', 'Skip'] },
  { day: 'Thu', cells: ['Vegetarian', 'Non-Veg', 'Vegetarian', 'Vegetarian'] },
  { day: 'Fri', cells: ['Vegetarian', 'Vegetarian', 'Vegetarian', 'Vegetarian'] },
  { day: 'Sat', cells: ['Vegetarian', 'Vegetarian', 'Non-Veg', 'Vegetarian'] },
  { day: 'Sun', cells: ['Vegetarian', 'Vegetarian', 'Vegetarian', 'Vegetarian'] },
];
const CUISINES: [string, number][] = [
  ['North Indian', 30], ['South Indian', 20], ['Punjabi', 15],
  ['Gujarati', 10], ['Chinese', 10], ['Thai', 10],
];
const GOALS = ['Lose Weight', 'Gain Muscle', 'Maintain Weight', 'Eat Healthier'];
const EXCLUSIONS = ['Peanuts', 'Shellfish', 'Mushrooms', 'Coriander', 'Onions', 'Garlic', 'Dairy'];
const BUDGETS = ['Budget Friendly · ₹1,000–2,000', 'Moderate · ₹2,000–4,000', 'Premium · ₹4,000–10,000+'];

const STEPS: [string, string][] = [
  ['step1', '1–2 · Path'], ['step2a', '2A · Blood test'], ['step3', '3 · Confirmation'],
  ['step4', '4 · About you'], ['step6', '6 · Weekly diet'], ['step6b', '6b · Cuisines'],
  ['step7', '7 · Exclusions'], ['step8', '8 · Budget'],
];

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: 9,
  marginTop: 4, background: 'var(--paper)', color: 'var(--ink)',
};

function StepHead({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <span style={{
        width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--serif)',
        fontSize: 14, flexShrink: 0,
      }}>{n}</span>
      <h3 style={{ fontSize: 19 }}>{title}</h3>
    </div>
  );
}

/** Onboarding — eight short steps that seed the meal-plan, groceries and supplements. */
export function Onboarding() {
  const [goal, setGoal] = useState('Lose Weight');
  const [cuisineTab, setCuisineTab] = useState<'Indian' | 'International'>('Indian');
  const [excluded, setExcluded] = useState<string[]>(['Peanuts', 'Shellfish']);
  const [budget, setBudget] = useState(BUDGETS[1]);
  const [matrix, setMatrix] = useState(MATRIX);

  const toggleExcl = (x: string) =>
    setExcluded((prev) => (prev.includes(x) ? prev.filter((e) => e !== x) : [...prev, x]));

  const setCell = (di: number, ci: number, val: string) =>
    setMatrix((prev) => prev.map((r, i) =>
      i === di ? { ...r, cells: r.cells.map((c, j) => (j === ci ? val : c)) } : r));

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · Onboarding</div>
      <h1 style={{ fontSize: 28, marginBottom: 10 }}>Let's personalise your nutrition experience</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        Eight short steps — your answers are saved to long-term memory and re-used across meal plans,
        groceries and supplements.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 40 }}>
        {STEPS.map(([id, label]) => (
          <a key={id} href={`#${id}`} style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '.06em', padding: '8px 14px',
            borderRadius: 999, border: '1px solid var(--line)', color: 'var(--muted)',
          }}>{label}</a>
        ))}
      </div>

      {/* STEP 1 */}
      <section id="step1" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="1" title="Choose your path" />
        <div className="grid2">
          <div className="card">
            <h4>Get Blood Test / Upload Existing Report</h4>
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 16px' }}>
              Scientific, AI-powered — your plan is built on your real biology, not guesses.
            </p>
            <a href="#step2a"><Button variant="accent" size="sm">Continue with blood test</Button></a>
          </div>
          <div className="card">
            <h4>Skip Blood Test</h4>
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 16px' }}>
              Feed us basic data instead — you can always add a report later.
            </p>
            <a href="#step4"><Button variant="line" size="sm">Skip to basic data</Button></a>
          </div>
        </div>
      </section>

      {/* STEP 2A */}
      <section id="step2a" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="2A" title="Choose your blood test" />
        <div className="grid2">
          <div className="card">
            <span className="tag gold">Most Recommended</span>
            <h4 style={{ marginTop: 10 }}>Comprehensive Panel</h4>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 14px' }}>
              90+ parameters · AI insights across every organ system.
            </p>
            <div style={{ fontSize: 22, fontWeight: 600 }}>₹1,499</div>
            <Link to="/nutrition/blood"><Button variant="accent" size="sm" style={{ marginTop: 14 }}>Book Comprehensive</Button></Link>
          </div>
          <div className="card">
            <h4>Basic Panel</h4>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 14px' }}>
              35+ parameters — CBC, sugar, cholesterol, kidney, liver.
            </p>
            <div style={{ fontSize: 22, fontWeight: 600 }}>₹799</div>
            <Link to="/nutrition/blood"><Button variant="line" size="sm" style={{ marginTop: 14 }}>Book Basic</Button></Link>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          All samples collected at home by NABL-accredited labs.
        </p>
      </section>

      {/* STEP 3 */}
      <section id="step3" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="3" title="Confirmation" />
        <div className="card">
          <p style={{ fontWeight: 600, fontSize: 16 }}>Your blood test is booked — Tomorrow, 10:00 AM</p>
          <div className="grid2" style={{ marginTop: 16 }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Do's</p>
              <p className="muted" style={{ fontSize: 13 }}>Fast 10–12 hours · Drink water · No heavy exercise</p>
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Don'ts</p>
              <p className="muted" style={{ fontSize: 13 }}>No smoking · No alcohol 24h prior · No unsupervised supplements</p>
            </div>
          </div>
          <a href="#step4"><Button variant="accent" size="sm" style={{ marginTop: 18 }}>Fill Basic Data while waiting →</Button></a>
        </div>
      </section>

      {/* STEP 4 */}
      <section id="step4" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="4" title="About you" />
        <div className="card">
          <div className="grid4">
            {([['Age', '32'], ['Gender', 'Male'], ['Height', '175 cm'], ['Weight', '70 kg']] as const).map(([lab, val]) => (
              <div key={lab}>
                <label className="muted" style={{ fontSize: 11 }}>{lab}</label>
                <input defaultValue={val} style={inputStyle} />
              </div>
            ))}
          </div>
          <p style={{ fontWeight: 600, fontSize: 13, margin: '18px 0 8px' }}>Your goal</p>
          <div className="pill-row">
            {GOALS.map((g) => (
              <span key={g} className={`pill${goal === g ? ' on' : ''}`} onClick={() => setGoal(g)} style={{ cursor: 'pointer' }}>{g}</span>
            ))}
          </div>
        </div>
      </section>

      {/* STEP 6 */}
      <section id="step6" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="6" title="Weekly diet-type matrix" />
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tc">
            <tbody>
              <tr><th>Day</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th><th>Snacks</th></tr>
              {matrix.map((row, di) => (
                <tr key={row.day}>
                  <td><b>{row.day}</b></td>
                  {row.cells.map((cell, ci) => (
                    <td key={ci}>
                      <select
                        value={cell}
                        onChange={(e) => setCell(di, ci, e.target.value)}
                        style={{ width: '100%', fontSize: 11, border: '1px solid var(--line)', borderRadius: 8, padding: 6, background: 'var(--paper)', color: 'var(--ink)' }}
                      >
                        {DIET_OPTS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* STEP 6b */}
      <section id="step6b" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="6b" title="Preferred cuisines" />
        <div className="card">
          <div className="tabrow">
            {(['Indian', 'International'] as const).map((t) => (
              <a key={t} href="#step6b" className={cuisineTab === t ? 'on' : ''} onClick={() => setCuisineTab(t)}>{t}</a>
            ))}
          </div>
          {CUISINES.map(([name, pct]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', fontSize: 13 }}>
              <span style={{ width: 130, flexShrink: 0, color: 'var(--ink-soft)' }}>{name}</span>
              <div style={{ flex: 1, height: 7, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 4 }} />
              </div>
              <span style={{ width: 38, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>{pct}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* STEP 7 */}
      <section id="step7" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="7" title="Foods you don't eat" />
        <div className="card">
          <div className="pill-row">
            {EXCLUSIONS.map((x) => (
              <span key={x} className={`pill${excluded.includes(x) ? ' on' : ''}`} onClick={() => toggleExcl(x)} style={{ cursor: 'pointer' }}>{x}</span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Saved to long-term memory — every future plan avoids these automatically.
          </p>
        </div>
      </section>

      {/* STEP 8 */}
      <section id="step8" style={{ marginBottom: 44, scrollMarginTop: 96 }}>
        <StepHead n="8" title="Weekly food budget" />
        <div className="card">
          <div className="pill-row">
            {BUDGETS.map((b) => (
              <span key={b} className={`pill${budget === b ? ' on' : ''}`} onClick={() => setBudget(b)} style={{ cursor: 'pointer' }}>{b}</span>
            ))}
          </div>
          <Link to="/nutrition/weekly">
            <Button variant="accent" style={{ marginTop: 24, width: '100%', justifyContent: 'center' }}>
              Finish &amp; Create My Plan →
            </Button>
          </Link>
        </div>
      </section>

      <div className="trust">
        <span>◈ Personalised for You</span><span>◈ Expert Guidance</span>
        <span>◈ Quality You Can Trust</span><span>◈ Better Every Day</span>
      </div>
    </div>
  );
}

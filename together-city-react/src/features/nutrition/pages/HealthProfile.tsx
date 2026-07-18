import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hero, Button } from '@/components/ui';

/** Weekly calorie chips. */
const DAYSTRIP: { d: string; k: string; tag: string; cls: string; on?: boolean }[] = [
  { d: 'Mon', k: '1,650', tag: 'Good', cls: 'green' },
  { d: 'Tue', k: '1,890', tag: 'Good', cls: 'green' },
  { d: 'Wed', k: '2,010', tag: 'Good', cls: 'green' },
  { d: 'Thu', k: '2,450', tag: 'Over · E', cls: 'red', on: true },
  { d: 'Fri', k: '1,780', tag: 'Good', cls: 'green' },
  { d: 'Sat', k: '2,120', tag: 'Close', cls: 'amber' },
  { d: 'Sun', k: '3,420', tag: 'Over · E', cls: 'red' },
];

type LogType = 'Meal Plan' | 'Extra' | 'Alcohol';
interface LogRow { id: number; name: string; kcal: number; type: LogType; tag: 'green' | 'amber' | 'red' }
const INITIAL_LOG: LogRow[] = [
  { id: 1, name: 'Oats Upma with Vegetables', kcal: 300, type: 'Meal Plan', tag: 'green' },
  { id: 2, name: 'Grilled Chicken Quinoa Bowl', kcal: 560, type: 'Meal Plan', tag: 'green' },
  { id: 3, name: 'Roasted Makhana with Green Tea', kcal: 150, type: 'Meal Plan', tag: 'green' },
  { id: 4, name: 'Palak Paneer with Phulka', kcal: 470, type: 'Meal Plan', tag: 'green' },
  { id: 5, name: 'Chicken Sandwich', kcal: 520, type: 'Extra', tag: 'amber' },
  { id: 6, name: 'Masala Chai', kcal: 120, type: 'Extra', tag: 'amber' },
  { id: 7, name: 'Red Wine (1 glass)', kcal: 180, type: 'Alcohol', tag: 'red' },
  { id: 8, name: 'Dark Chocolate (2 squares)', kcal: 120, type: 'Extra', tag: 'amber' },
];

const MACROS: { lbl: string; pct: number; over?: boolean; val: string }[] = [
  { lbl: 'Protein', pct: 93, val: '102/110g' },
  { lbl: 'Carbs', pct: 90, val: '248/275g' },
  { lbl: 'Fats', pct: 100, over: true, val: '78/73g' },
  { lbl: 'Fibre', pct: 87, val: '26/30g' },
];
const KCAL_SRC: { lbl: string; pct: number; color?: string }[] = [
  { lbl: 'From Plan', pct: 78 },
  { lbl: 'Extra Items', pct: 10, color: '#9a7b2e' },
  { lbl: 'Alcohol', pct: 12, color: '#b0503e' },
];

// Nutrition-linked activity targets (default profile: 65 kg maintain).
const TARGET_KCAL = 2124;
const BURN_WORKOUT = 390;   // MET 6 · 60 min
const BURN_WALK = 93;       // MET 4.3 · 20 min
const BURN_TOTAL = BURN_WORKOUT + BURN_WALK;
const WALK_STEPS = 2600;    // 20 min @ 130 spm
const WALK_ONLY_MIN = 104;
const WALK_ONLY_STEPS = 13520;

const DEVICES: [string, string][] = [
  ['apple', '⌚ Apple Watch / Apple Health'],
  ['googlefit', '🤖 Google Fit'],
  ['fitbit', '⌚ Fitbit'],
  ['samsung', '⌚ Samsung Health'],
];

const HUBS: { to: string; title: string; body: string; label: string }[] = [
  { to: '/medical', title: '◈ Medical Hub', body: 'Your blood tests, vitals and Health Score come from here. New reports update your analysis automatically.', label: 'Open Medical Hub →' },
  { to: '/nutrition', title: '◈ Nutrition Hub', body: "Your calorie targets, meal plan and macros flow from your Nutrition profile and set today's activity goal.", label: 'Open Nutrition Hub →' },
  { to: '/nutrition/daily', title: '◈ Daily Plan', body: "Today's plate and macros drive the intake side of your calorie balance.", label: 'Open Daily Planner →' },
];

function Bar({ lbl, pct, val, over, color }: { lbl: string; pct: number; val: string; over?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', fontSize: 13 }}>
      <span style={{ width: 100, flexShrink: 0, color: 'var(--ink-soft)' }}>{lbl}</span>
      <div style={{ flex: 1, height: 7, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 4, background: over ? '#b0503e' : color ?? 'var(--accent)' }} />
      </div>
      <span style={{ width: 64, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>{val}</span>
    </div>
  );
}

function Stat({ lab, val, delta, color }: { lab: string; val: string; delta?: string; color?: string }) {
  return (
    <div className="stat">
      <div className="lab">{lab}</div>
      <div className="val" style={color ? { color } : undefined}>{val}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}

/** My Health Profile — calorie tracker, macros, food journal and activity, linked across hubs. */
export function HealthProfile() {
  const [log, setLog] = useState(INITIAL_LOG);
  const [device, setDevice] = useState<string | null>(null);

  const remove = (id: number) => setLog((prev) => prev.filter((r) => r.id !== id));

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px' }}>
      <Hero
        image="/assets/img/health-profile-hero.webp"
        eyebrow="Fitness · 01"
        title="My Health Profile"
        sub="Your complete health picture — calorie tracker, macros and food journal alongside your activity goal, workout and smartwatch data. Connected to your Medical and Nutrition hubs."
        objectPosition="center 26%"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 20 }}>
            {DAYSTRIP.map((c) => (
              <div key={c.d} className={`card center${c.on ? '' : ''}`} style={{ minWidth: 84, padding: '12px 8px', border: c.on ? '2px solid var(--accent)' : '1px solid var(--line)' }}>
                <div className="muted" style={{ fontSize: 12 }}>{c.d}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.k}</div>
                <span className={`tag ${c.cls}`} style={{ marginTop: 6, display: 'inline-block' }}>{c.tag}</span>
              </div>
            ))}
          </div>

          <div className="grid4" style={{ marginBottom: 30 }}>
            <Stat lab="Intake" val="2,450" />
            <Stat lab="Goal" val="2,200" />
            <Stat lab="Remaining" val="−250" color="#b0503e" />
            <Stat lab="Status" val="Over Goal" color="#b0503e" />
          </div>

          <div className="tabrow" style={{ marginBottom: 14 }}>
            <a className="on" href="#log">All ({log.length})</a>
            <a href="#log">Meals from Plan ({log.filter((r) => r.type === 'Meal Plan').length})</a>
            <a href="#log">Extra Items ({log.filter((r) => r.type === 'Extra').length})</a>
            <a href="#log">Alcohol ({log.filter((r) => r.type === 'Alcohol').length})</a>
          </div>

          <table className="tc" id="log">
            <tbody>
              <tr><th>Item</th><th>kcal</th><th>Type</th><th /></tr>
              {log.map((r) => (
                <tr key={r.id}>
                  <td>{r.type === 'Meal Plan' ? <b>{r.name}</b> : r.name}</td>
                  <td>{r.kcal}</td>
                  <td><span className={`tag ${r.tag}`}>{r.type}</span></td>
                  <td className="muted">
                    <button type="button" onClick={() => remove(r.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="line" size="sm" style={{ marginTop: 16 }}>+ Add Another Entry (5 extra items/day max)</Button>

          <div className="blk-head" style={{ marginTop: 40 }}><h2>Macronutrients</h2></div>
          <div className="card">{MACROS.map((m) => <Bar key={m.lbl} {...m} />)}</div>

          <div className="blk-head" style={{ marginTop: 40 }}><h2>Kcal Sources</h2></div>
          <div className="card">{KCAL_SRC.map((s) => <Bar key={s.lbl} lbl={s.lbl} pct={s.pct} val={`${s.pct}%`} color={s.color} />)}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 96 }}>
          <div className="card center">
            <div style={{ fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 600 }}>758</div>
            <div className="muted" style={{ fontSize: 12 }}>Health Score · of 1000</div>
            <p style={{ marginTop: 12, fontWeight: 600 }}>Great Progress! 🎉</p>
            <Link to="/nutrition/daily"><Button variant="line" size="sm" style={{ marginTop: 10 }}>Today's plan →</Button></Link>
          </div>
          <div className="card">
            <h4 style={{ marginBottom: 10 }}>Monthly Snapshot</h4>
            <div className="grid2">
              <Stat lab="Avg / day" val="1,835" />
              <Stat lab="Streak" val="6 days" />
              <Stat lab="Within goal" val="18 days" />
              <Stat lab="Over goal" val="9 days" />
            </div>
          </div>
          <div className="note">Watch weekends — Saturday and Sunday average 640 kcal higher than weekdays.</div>
          <div className="note">Limit alcohol — 3 of your last 7 over-goal days included a drink.</div>
        </div>
      </div>

      <div className="blk-head" style={{ marginTop: 44 }}><h2>Fitness &amp; activity</h2></div>
      <div className="grid2" style={{ marginBottom: 26 }}>
        {device ? (
          <>
            <Stat lab="Steps Today" val="6,400" delta="goal 10,000" />
            <Stat lab="Active Minutes" val="80 min" delta={`goal ${60 + 20} min`} />
          </>
        ) : (
          <>
            <Stat lab="Steps Today" val="—" delta="connect a device" />
            <Stat lab="Active Minutes" val="80 min" delta="from logged activity" />
          </>
        )}
      </div>

      <section style={{ marginBottom: 26 }}>
        <div className="blk-head"><h2>Today's activity goal</h2><Link className="muted" to="/nutrition/daily" style={{ fontSize: 12 }}>From your Nutrition plan →</Link></div>
        <div className="card">
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            To maintain your <b style={{ color: 'var(--ink)' }}>{TARGET_KCAL.toLocaleString('en-IN')} kcal</b> Nutrition plan,
            aim to burn about <b style={{ color: 'var(--ink)' }}>{BURN_TOTAL} kcal</b> today through activity:
          </p>
          <div className="grid3">
            <div className="stat"><div className="lab">Work out</div><div className="val" style={{ fontSize: 20 }}>60 min</div><div className="delta">circuit &amp; strength · ≈ {BURN_WORKOUT} kcal</div></div>
            <div className="stat"><div className="lab">Walk</div><div className="val" style={{ fontSize: 20 }}>20 min</div><div className="delta">brisk · ≈ {WALK_STEPS.toLocaleString('en-IN')} steps · ≈ {BURN_WALK} kcal</div></div>
            <div className="stat"><div className="lab">Total burn</div><div className="val" style={{ fontSize: 20 }}>{BURN_TOTAL}</div><div className="delta">kcal today</div></div>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            Prefer to only walk? Walk about <b>{WALK_ONLY_MIN} min</b> (≈ {WALK_ONLY_STEPS.toLocaleString('en-IN')} steps)
            to burn the same {BURN_TOTAL} kcal.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 26 }}>
        <div className="blk-head"><h2>Health app &amp; smartwatch</h2></div>
        <div className="card">
          {device ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="av" style={{ width: 48, height: 48, fontSize: 20 }}>⌚</div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <h4>{(DEVICES.find((d) => d[0] === device) ?? ['', 'Health app'])[1].replace(/^\S+ /, '')}</h4>
                <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Synced just now · steps &amp; heart-rate active</p>
              </div>
              <span className="tag green">Connected</span>
              <Button variant="line" size="sm" onClick={() => setDevice(null)}>Disconnect</Button>
            </div>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Connect your health app or smartwatch to sync <b>steps, heart rate, sleep &amp; calories</b> automatically.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
                {DEVICES.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setDevice(key)}
                    style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', background: 'var(--card)', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left' }}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <div className="note">◈ Your activity and Health Score sync automatically with your calorie targets, meal plans and supplement dosage — they adapt to how much you move.</div>

      <section style={{ marginTop: 26 }}>
        <div className="blk-head"><h2>Connected across Together City</h2></div>
        <div className="grid3">
          {HUBS.map((h) => (
            <Link key={h.to} to={h.to} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <b style={{ fontSize: 14 }}>{h.title}</b>
              <p className="muted" style={{ fontSize: 12.5, margin: '5px 0' }}>{h.body}</p>
              <span style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>{h.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="trust">
        <span>◈ Personalised for You</span><span>◈ Expert Guidance</span>
        <span>◈ Quality You Can Trust</span><span>◈ Better Every Day</span>
      </div>
    </div>
  );
}

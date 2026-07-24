import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Button, EmptyState } from '@/components/ui';
import { useNutritionTargets, useHealthLog, useAddCalorie, useRemoveCalorie } from '../hooks';

type LogType = 'Meal Plan' | 'Extra' | 'Alcohol';
const TYPE_TAG: Record<LogType, 'green' | 'amber' | 'red'> = { 'Meal Plan': 'green', Extra: 'amber', Alcohol: 'red' };
const LOG_TYPES: LogType[] = ['Meal Plan', 'Extra', 'Alcohol'];

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekDatesOf(base: Date): string[] {
  const monday = new Date(base); monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return isoOf(d); });
}


function Bar({ lbl, pct, val, color }: { lbl: string; pct: number; val: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', fontSize: 13 }}>
      <span style={{ width: 100, flexShrink: 0, color: 'var(--ink-soft)' }}>{lbl}</span>
      <div style={{ flex: 1, height: 7, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 4, background: color ?? 'var(--accent)' }} />
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

/** My Health Profile — your own calorie tracker + activity goal. Starts empty:
 *  targets come from your Nutrition profile, entries are yours to log. */
export function HealthProfile() {
  const targets = useNutritionTargets();
  const now = useMemo(() => new Date(), []);
  const todayStr = isoOf(now);
  const weekDates = useMemo(() => weekDatesOf(now), [now]);
  const health = useHealthLog(weekDates);
  const addCal = useAddCalorie();
  const delCal = useRemoveCalorie();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; kcal: string; type: LogType }>({ name: '', kcal: '', type: 'Extra' });

  const entries = health.data?.entries ?? [];
  const log = entries.filter((e) => e.date === todayStr);
  const dayTotal = (dateStr: string) => entries.filter((e) => e.date === dateStr).reduce((a, e) => a + e.kcal, 0);

  const goal = targets.data?.kcal ?? 0;
  const intake = log.reduce((a, r) => a + r.kcal, 0);
  const remaining = goal ? goal - intake : 0;
  const extrasCount = log.filter((r) => r.type === 'Extra').length;
  const status = !log.length ? { t: 'No log yet', c: 'var(--muted)' as string, cls: 'amber' }
    : remaining < 0 ? { t: 'Over goal', c: '#b0503e', cls: 'red' }
    : remaining <= goal * 0.1 ? { t: 'Close', c: '#9a7b2e', cls: 'amber' }
    : { t: 'On track', c: 'var(--accent)', cls: 'green' };

  // Real weekly stats from the persisted log.
  const loggedDates = weekDates.filter((d) => dayTotal(d) > 0);
  const avgDay = loggedDates.length ? Math.round(loggedDates.reduce((a, d) => a + dayTotal(d), 0) / loggedDates.length) : 0;
  let streak = 0;
  for (let i = weekDates.indexOf(todayStr); i >= 0; i--) { if (dayTotal(weekDates[i]) > 0) streak++; else break; }
  const withinGoal = goal ? loggedDates.filter((d) => dayTotal(d) <= goal).length : 0;
  const overGoal = goal ? loggedDates.filter((d) => dayTotal(d) > goal).length : 0;

  const addEntry = () => {
    const k = parseInt(draft.kcal, 10);
    if (!draft.name.trim() || !k || k <= 0) return;
    if (draft.type === 'Extra' && extrasCount >= 5) return;
    addCal.mutate({ date: todayStr, name: draft.name.trim(), kcal: k, type: draft.type });
    setDraft({ name: '', kcal: '', type: 'Extra' });
    setAdding(false);
  };
  const remove = (id: string) => delCal.mutate(id);

  // Kcal split by source — real, from the log.
  const srcTotals: Record<LogType, number> = { 'Meal Plan': 0, Extra: 0, Alcohol: 0 };
  log.forEach((r) => { srcTotals[r.type] += r.kcal; });
  const srcPct = (v: number) => (intake ? Math.round((v / intake) * 100) : 0);


  const macroTargets = targets.data
    ? ([['Protein', targets.data.protein], ['Carbs', targets.data.carb], ['Fat', targets.data.fat], ['Fibre', targets.data.fiber]] as [string, number][])
    : [];

  const fld: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px' }}>
      <PageHeader
        eyebrow="Fitness · 01"
        title="My Health Profile"
        sub="Your complete health picture — calorie tracker, macros and food journal alongside your activity goal, workout and smartwatch data. Connected to your Medical and Nutrition hubs."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
        <div>
          {/* week strip — today reflects your log; history builds as you use it */}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 20 }}>
            {WEEK.map((d, i) => {
              const dateStr = weekDates[i];
              const isToday = dateStr === todayStr;
              const kcal = dayTotal(dateStr);
              return (
                <div key={d} className="card center" style={{ minWidth: 84, padding: '12px 8px', border: isToday ? '2px solid var(--accent)' : '1px solid var(--line)' }}>
                  <div className="muted" style={{ fontSize: 12 }}>{d}</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{kcal ? kcal.toLocaleString('en-IN') : '—'}</div>
                  {isToday && kcal > 0 && <span className={`tag ${status.cls}`} style={{ marginTop: 6, display: 'inline-block' }}>{status.t}</span>}
                </div>
              );
            })}
          </div>

          <div className="grid4" style={{ marginBottom: 30 }}>
            <Stat lab="Intake" val={intake ? intake.toLocaleString('en-IN') : '0'} />
            <Stat lab="Goal" val={goal ? goal.toLocaleString('en-IN') : '—'} />
            <Stat lab="Remaining" val={goal ? (remaining < 0 ? '−' : '') + Math.abs(remaining).toLocaleString('en-IN') : '—'} color={remaining < 0 ? '#b0503e' : undefined} />
            <Stat lab="Status" val={status.t} color={status.c} />
          </div>

          <div className="tabrow" style={{ marginBottom: 14 }}>
            <a className="on" href="#log">All ({log.length})</a>
            <a href="#log">Meals from Plan ({log.filter((r) => r.type === 'Meal Plan').length})</a>
            <a href="#log">Extra Items ({extrasCount})</a>
            <a href="#log">Alcohol ({log.filter((r) => r.type === 'Alcohol').length})</a>
          </div>

          {log.length === 0 ? (
            <div className="card" id="log">
              <EmptyState icon="🍽" title="Nothing logged yet" hint="Add what you eat and drink through the day to track it against your calorie goal." />
            </div>
          ) : (
            <table className="tc" id="log">
              <tbody>
                <tr><th>Item</th><th>kcal</th><th>Type</th><th /></tr>
                {log.map((r) => (
                  <tr key={r.id}>
                    <td>{r.type === 'Meal Plan' ? <b>{r.name}</b> : r.name}</td>
                    <td>{r.kcal}</td>
                    <td><span className={`tag ${TYPE_TAG[r.type]}`}>{r.type}</span></td>
                    <td className="muted">
                      <button type="button" onClick={() => remove(r.id)} aria-label="Remove"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {adding ? (
            <div className="card" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr auto', gap: 8, alignItems: 'center' }}>
              <input autoFocus placeholder="What did you have?" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={fld} />
              <input type="number" min={1} placeholder="kcal" value={draft.kcal} onChange={(e) => setDraft({ ...draft, kcal: e.target.value })} style={fld} />
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as LogType })} style={fld}>
                {LOG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="accent" onClick={addEntry}>Add</Button>
                <Button size="sm" variant="line" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="line" size="sm" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>+ Add an entry (max 5 extra items/day)</Button>
          )}

          <div className="blk-head" style={{ marginTop: 40 }}><h2>Daily macro targets</h2></div>
          <div className="card">
            {macroTargets.length ? (
              <div className="grid4">
                {macroTargets.map(([lbl, g]) => (
                  <div key={lbl} className="stat"><div className="lab">{lbl}</div><div className="val" style={{ fontSize: 20 }}>{g}g</div></div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>Set your <Link to="/nutrition/preferences" style={{ color: 'var(--accent)' }}>Nutrition profile</Link> to see your daily macro targets.</p>
            )}
          </div>

          <div className="blk-head" style={{ marginTop: 40 }}><h2>Kcal sources</h2></div>
          <div className="card">
            {intake ? (
              LOG_TYPES.map((t) => <Bar key={t} lbl={t} pct={srcPct(srcTotals[t])} val={`${srcPct(srcTotals[t])}%`} color={t === 'Alcohol' ? '#b0503e' : t === 'Extra' ? '#9a7b2e' : undefined} />)
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>Log meals to see where your calories come from.</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 96 }}>
          <div className="card center">
            <div style={{ fontFamily: 'var(--serif)', fontSize: 40, fontWeight: 600 }}>—</div>
            <div className="muted" style={{ fontSize: 12 }}>Health Score · of 1000</div>
            <p className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>Your Health Score is generated from your Medical hub once you add a blood report.</p>
            <Link to="/medical/records"><Button variant="line" size="sm" style={{ marginTop: 10 }}>Open Medical Hub →</Button></Link>
          </div>
          <div className="card">
            <h4 style={{ marginBottom: 10 }}>This week</h4>
            <div className="grid2">
              <Stat lab="Avg / day" val={avgDay ? avgDay.toLocaleString('en-IN') : '—'} />
              <Stat lab="Streak" val={streak ? `${streak} day${streak > 1 ? 's' : ''}` : '—'} />
              <Stat lab="Within goal" val={loggedDates.length ? String(withinGoal) : '—'} />
              <Stat lab="Over goal" val={loggedDates.length ? String(overGoal) : '—'} />
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Builds as you log each day.</p>
          </div>
        </div>
      </div>

      <div className="blk-head" style={{ marginTop: 44 }}><h2>Fitness &amp; activity</h2></div>
      <div className="grid2" style={{ marginBottom: 26 }}>
        <Stat lab="Steps Today" val="—" delta="sync coming soon" />
        <Stat lab="Active Minutes" val="—" delta="sync coming soon" />
      </div>

      <section style={{ marginBottom: 26 }}>
        <div className="blk-head"><h2>Physical activity</h2></div>
        <div className="card">
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 12, lineHeight: 1.5 }}>
            Daily movement complements your nutrition plan and supports your health goals — it isn't required to make the plan work. These are general guidelines, not a prescription.
          </p>
          <div className="grid3">
            <div className="stat"><div className="lab">Strength</div><div className="val" style={{ fontSize: 20 }}>2–3× / week</div><div className="delta">circuit &amp; strength</div></div>
            <div className="stat"><div className="lab">Daily steps</div><div className="val" style={{ fontSize: 20 }}>7–10k</div><div className="delta">a common general target</div></div>
            <div className="stat"><div className="lab">Active minutes</div><div className="val" style={{ fontSize: 20 }}>150 / week</div><div className="delta">moderate activity (WHO)</div></div>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
            {goal
              ? <>Your nutrition plan provides about <b style={{ color: 'var(--ink)' }}>{goal.toLocaleString('en-IN')} kcal</b>/day. Connect a fitness device to track your actual activity and energy expenditure.</>
              : <>Set your <Link to="/nutrition/preferences" style={{ color: 'var(--accent)' }}>Nutrition profile</Link> to personalise this.</>}
          </p>
        </div>
      </section>

      <div className="trust">
        <span>◈ Personalised for You</span><span>◈ Expert Guidance</span>
        <span>◈ Quality You Can Trust</span><span>◈ Better Every Day</span>
      </div>
    </div>
  );
}

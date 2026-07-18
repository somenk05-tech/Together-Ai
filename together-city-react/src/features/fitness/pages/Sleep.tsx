import { useMemo, useState } from 'react';

interface Entry { total: number; wakes: number; bed: string; wake: string; score: number }
type Log = Record<string, Entry>;
interface Target { bed: string; wake: string }

const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STAGE_COLOR = { deep: '#3b3a86', rem: '#6a5acd', light: '#9bb0e0', awake: '#d9a24a' } as const;
const BAND_COLOR: Record<string, string> = { great: '#2e7d4f', good: '#6a5acd', fair: '#c6a15b', poor: '#d9534f', none: 'var(--line)' };
const BAND_LBL: Record<string, string> = { great: 'Great', good: 'Good', fair: 'Fair', poor: 'Poor' };

const toMin = (t: string) => { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1]); };
const durMin = (bed: string, wake: string) => { let m = toMin(wake) - toMin(bed); if (m <= 0) m += 24 * 60; return m; };
const hm = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return `${h}h ${m < 10 ? '0' : ''}${m}m`; };
const t12 = (t: string) => { const p = String(t).split(':'); let h = +p[0]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${p[1]} ${ap}`; };
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function stages(total: number, quality: number) {
  const deep = Math.round(total * (0.13 + 0.09 * quality));
  const rem = Math.round(total * (0.18 + 0.07 * quality));
  let awake = Math.round(total * (0.06 - 0.04 * quality)); if (awake < 3) awake = 3;
  let light = total - deep - rem - awake; if (light < 0) light = 0;
  return { deep, rem, light, awake };
}
function scoreOf(total: number, goal: number, wakes: number) {
  const durScore = 100 - Math.min(40, (Math.abs(total - goal) / goal) * 120);
  const wakeScore = 100 - Math.min(30, wakes * 8);
  return Math.max(35, Math.min(99, Math.round(durScore * 0.6 + wakeScore * 0.4)));
}
const band = (sc: number) => sc >= 85 ? 'great' : sc >= 72 ? 'good' : sc >= 58 ? 'fair' : 'poor';

function seed(target: Target): Log {
  const goal = durMin(target.bed, target.wake);
  const demo = [{ h: 7.2, w: 1 }, { h: 6.4, w: 2 }, { h: 7.8, w: 0 }, { h: 6.9, w: 1 }, { h: 5.9, w: 3 }, { h: 7.5, w: 1 }, { h: 6.7, w: 2 }];
  const log: Log = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const row = demo[6 - i]; const tot = Math.round(row.h * 60);
    log[dayKey(d)] = { total: tot, wakes: row.w, bed: target.bed, wake: target.wake, score: scoreOf(tot, goal, row.w) };
  }
  return log;
}

const inS = { border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' } as const;
const fieldL = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--ink-soft)' } as const;

const DEVICES = ['◈ Apple Health', '◈ Google Fit', '◈ Fitbit', '◈ Samsung Health'];

/** Sleep Cycle — duration, quality, schedule and a 7-day log, seeded with demo nights (local state). */
export function Sleep() {
  const [target, setTarget] = useState<Target>({ bed: '23:00', wake: '07:00' });
  const [log, setLog] = useState<Log>(() => seed({ bed: '23:00', wake: '07:00' }));
  const [device, setDevice] = useState<string | null>(null);
  const [bedF, setBedF] = useState('23:00');
  const [wakeF, setWakeF] = useState('07:00');
  const [logBed, setLogBed] = useState('23:20');
  const [logWake, setLogWake] = useState('06:50');
  const [logWakes, setLogWakes] = useState(1);

  const goal = durMin(target.bed, target.wake);
  const keys = useMemo(() => Object.keys(log).sort(), [log]);
  const latest = keys.length ? { key: keys[keys.length - 1], ...log[keys[keys.length - 1]] } : null;

  const weekKeys = keys.slice(-7);
  const weekAvg = weekKeys.length ? Math.round(weekKeys.reduce((s, k) => s + log[k].total, 0) / weekKeys.length) : 0;

  const saveSchedule = () => {
    const nt = { bed: bedF || '23:00', wake: wakeF || '07:00' };
    const g = durMin(nt.bed, nt.wake);
    setLog((l) => { const n: Log = {}; for (const k of Object.keys(l)) n[k] = { ...l[k], score: scoreOf(l[k].total, g, l[k].wakes) }; return n; });
    setTarget(nt);
  };
  const addLog = () => {
    const tot = durMin(logBed, logWake);
    setLog((l) => ({ ...l, [dayKey()]: { total: tot, wakes: logWakes, bed: logBed, wake: logWake, score: scoreOf(tot, goal, logWakes) } }));
  };

  const schedNote = goal < 7 * 60 ? 'That is under 7 hours — most adults do best on 7–9 hours. Try an earlier bedtime.'
    : goal > 9 * 60 ? 'That is over 9 hours — plenty of runway; consistency is what counts.'
    : 'A healthy 7–9 hour window. Keep bedtime within ~30 min every night, including weekends.';

  const sc = latest ? latest.score : 0;
  const b = band(sc); const q = sc / 100;
  const st = latest ? stages(latest.total, q) : { deep: 0, rem: 0, light: 0, awake: 0 };
  const tot = latest ? latest.total : 1;
  const C = 2 * Math.PI * 54;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px 40px' }}>
      <div className="hero" style={{ minHeight: 260, marginBottom: 26, background: 'linear-gradient(120deg,#10141f 0%,#1b2540 45%,#2a2340 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.8, backgroundImage: 'radial-gradient(1.4px 1.4px at 20% 30%,rgba(255,255,255,.7),transparent),radial-gradient(1.2px 1.2px at 65% 20%,rgba(255,255,255,.6),transparent),radial-gradient(1.6px 1.6px at 80% 55%,rgba(255,255,255,.55),transparent),radial-gradient(1.2px 1.2px at 40% 70%,rgba(255,255,255,.5),transparent),radial-gradient(1.3px 1.3px at 88% 80%,rgba(255,255,255,.5),transparent)' }} />
        <div className="inner" style={{ position: 'relative', zIndex: 2 }}>
          <div className="eyebrow" style={{ color: '#c6b7ff' }}>Fitness · 04</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,40px)', color: '#fff' }}>Sleep Cycle</h1>
          <p className="sub" style={{ marginTop: 6, color: 'rgba(255,255,255,.82)' }}>Track how long and how well you sleep, keep a steady bedtime, and see how rest feeds your Health Score, recovery and nutrition.</p>
        </div>
      </div>

      {/* last night */}
      <div className="grid2" style={{ alignItems: 'start', marginBottom: 30 }}>
        <div className="card center">
          <div className="ring" style={{ margin: '0 auto' }}>
            <svg width="120" height="120"><circle className="bgc" cx="60" cy="60" r="54" /><circle className="fgc" cx="60" cy="60" r="54" style={{ strokeDasharray: C.toFixed(1), strokeDashoffset: (C * (1 - sc / 100)).toFixed(1), transition: 'stroke-dashoffset .6s ease' }} /></svg>
            <div className="cent"><b>{latest ? sc : '—'}</b><span>sleep score</span></div>
          </div>
          <p style={{ marginTop: 12, fontWeight: 600 }}>Last night</p>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{latest ? `${BAND_LBL[b]} · goal ${hm(goal)}` : ''}</p>
        </div>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Time asleep</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 26 }}>{latest ? hm(latest.total) : '—'}</div>
              </div>
              {latest && <div className="muted" style={{ fontSize: 12.5 }}>Asleep <b>{t12(latest.bed)}</b> → <b>{t12(latest.wake)}</b></div>}
            </div>
            <div style={{ display: 'flex', height: 22, borderRadius: 8, overflow: 'hidden', margin: '12px 0 6px' }}>
              {(['deep', 'rem', 'light', 'awake'] as const).map((k) => <i key={k} style={{ display: 'block', height: '100%', width: `${(st[k] / tot) * 100}%`, background: STAGE_COLOR[k] }} />)}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--ink-soft)' }}>
              {(['deep', 'rem', 'light', 'awake'] as const).map((k) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <b style={{ width: 10, height: 10, borderRadius: 3, display: 'inline-block', background: STAGE_COLOR[k] }} />
                  {k[0].toUpperCase() + k.slice(1)} {hm(st[k])}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
            {[
              { l: 'Deep sleep', v: `${Math.round((st.deep / tot) * 100)}%` },
              { l: 'REM', v: `${Math.round((st.rem / tot) * 100)}%` },
              { l: 'Times woke', v: latest ? String(latest.wakes) : '—' },
              { l: 'vs goal', v: latest ? `${latest.total >= goal ? '+' : '-'}${hm(Math.abs(latest.total - goal))}` : '—', c: latest && latest.total >= goal - 20 ? '#2e7d4f' : '#b0503e' },
            ].map((m) => (
              <div key={m.l} className="stat" style={{ background: 'var(--accent-soft)', borderRadius: 12, padding: 14 }}>
                <div className="lab">{m.l}</div><div className="val" style={{ fontSize: 18, color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* this week */}
      <section className="blk">
        <div className="blk-head"><h2>This week</h2><span className="muted" style={{ fontSize: 12 }}>{weekKeys.length ? `Avg ${hm(weekAvg)} · goal ${hm(goal)}` : ''}</span></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {weekKeys.map((k) => {
              const r = log[k]; const d = new Date(k + 'T00:00:00');
              return (
                <div key={k} style={{ flex: 1, minWidth: 56, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 4px' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{DAYNAMES[d.getDay()]}</div>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', margin: '6px auto 3px', background: BAND_COLOR[band(r.score)] }} />
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{(r.total / 60).toFixed(1)}h</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* schedule */}
      <section className="blk">
        <div className="blk-head"><h2>Your sleep schedule</h2><span className="muted" style={{ fontSize: 12 }}>Consistency matters most</span></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={fieldL}>Bedtime<input style={inS} type="time" value={bedF} onChange={(e) => setBedF(e.target.value)} /></label>
            <label style={fieldL}>Wake<input style={inS} type="time" value={wakeF} onChange={(e) => setWakeF(e.target.value)} /></label>
            <label style={fieldL}>Nightly goal<input style={{ ...inS, width: 90 }} type="text" value={hm(durMin(bedF, wakeF))} readOnly /></label>
            <button type="button" className="btn btn-accent btn-sm" onClick={saveSchedule}>Save schedule</button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>{schedNote}</p>
        </div>
      </section>

      {/* log */}
      <section className="blk">
        <div className="blk-head"><h2>Log last night</h2><span className="muted" style={{ fontSize: 12 }}>Or let your device do it</span></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={fieldL}>Fell asleep<input style={inS} type="time" value={logBed} onChange={(e) => setLogBed(e.target.value)} /></label>
            <label style={fieldL}>Woke up<input style={inS} type="time" value={logWake} onChange={(e) => setLogWake(e.target.value)} /></label>
            <label style={fieldL}>Times woke<input style={{ ...inS, width: 90 }} type="number" min={0} max={12} value={logWakes} onChange={(e) => setLogWakes(Number(e.target.value))} /></label>
            <button type="button" className="btn btn-accent btn-sm" onClick={addLog}>Add to log</button>
          </div>
        </div>
      </section>

      {/* device */}
      <section className="blk">
        <div className="blk-head"><h2>Health app &amp; smartwatch</h2></div>
        <div className="card">
          {device ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div><b style={{ fontSize: 13.5 }}>✓ {device} connected</b><div className="muted" style={{ fontSize: 12 }}>Sleep stages and wake times sync automatically each morning.</div></div>
              <button type="button" className="btn btn-line btn-sm" onClick={() => setDevice(null)}>Disconnect</button>
            </div>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Connect a wearable or health app to log sleep automatically — no manual entry.</p>
              <div className="grid2" style={{ gap: 10 }}>
                {DEVICES.map((d) => (
                  <button key={d} type="button" onClick={() => setDevice(d.replace('◈ ', ''))}
                    style={{ border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left', width: '100%' }}>{d}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* connected hubs */}
      <section className="blk">
        <div className="blk-head"><h2>Connected across Together City</h2></div>
        <div className="grid2">
          <div className="card">
            <b style={{ fontSize: 14 }}>◈ Nutrition Hub</b>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>We flag late caffeine and heavy dinners against your bedtime, and nudge magnesium-rich foods on poor-sleep days.</p>
          </div>
          <div className="card">
            <b style={{ fontSize: 14 }}>◈ Medical Hub</b>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>Sleep quality feeds your Health Score and recovery. Persistent poor sleep can prompt a check-in with a doctor.</p>
          </div>
        </div>
      </section>

      <div className="note">◈ Rest is part of training. Your Health Profile reads your sleep to tune recovery days, calorie needs and workout intensity.</div>
    </div>
  );
}

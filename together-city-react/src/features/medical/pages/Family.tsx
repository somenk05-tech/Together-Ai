import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Member { in: string; name: string; sub: string; rows: [string, React.ReactNode][] }
const MEMBERS: Member[] = [
  { in: 'S', name: 'Somen (You)', sub: 'TC-00024891 · Blood Group O+', rows: [['Health Score', <b>758 / 1000</b>], ['Allergies', 'None known'], ['Last Checkup', '28 May 2025'], ['Next Reminder', 'Blood test due in 12 days']] },
  { in: 'A', name: 'Ananya', sub: 'Spouse · Blood Group B+', rows: [['Health Score', <b>812 / 1000</b>], ['Allergies', 'Penicillin'], ['Last Checkup', '14 Jun 2025'], ['Next Reminder', 'Dermatologist follow-up, 20 Jul']] },
  { in: 'P', name: 'Papa (Rajesh)', sub: 'Father · Age 64 · Blood Group A+', rows: [['Condition', 'Hypertension (managed)'], ['Medication', 'BP tablet · 8 AM & 8 PM'], ['Last Checkup', '2 Jul 2025'], ['Next Reminder', 'Cardiology review, 25 Jul']] },
  { in: 'M', name: 'Maa (Sunita)', sub: 'Mother · Age 61 · Blood Group B+', rows: [['Condition', 'Type 2 Diabetes (managed)'], ['Medication', 'Metformin 500mg · 2× daily'], ['Last Checkup', '30 Jun 2025'], ['Next Reminder', 'HbA1c retest, 5 Aug']] },
];

interface Managed { id: string; name: string; rel: string }
const MANAGED: Managed[] = [
  { id: 'ananya', name: 'Ananya', rel: 'Spouse' },
  { id: 'papa', name: 'Papa (Rajesh)', rel: 'Father' },
  { id: 'maa', name: 'Maa (Sunita)', rel: 'Mother' },
];

interface Invite { username: string; status: string }

/** Family Profiles — records, allergies, medications & reminders (ported from medical-family.html). */
export function Family() {
  const [state, setState] = useState<Record<string, { disabled?: boolean; removed?: boolean }>>({});
  const [invites, setInvites] = useState<Invite[]>([]);
  const [search, setSearch] = useState('');

  const toggleDisabled = (id: string) => setState((s) => ({ ...s, [id]: { ...s[id], disabled: !s[id]?.disabled } }));
  const remove = (id: string) => setState((s) => ({ ...s, [id]: { ...s[id], removed: true } }));

  const connect = () => {
    const u = search.trim().replace(/^@/, '');
    if (!u || invites.some((x) => x.username.toLowerCase() === u.toLowerCase())) return;
    setInvites((v) => [{ username: u, status: 'Invited' }, ...v]);
    setSearch('');
  };

  const live = MANAGED.filter((m) => !state[m.id]?.removed);

  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow">Medical Hub · 07</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Family Profiles</h1>
        <p className="lede" style={{ marginTop: 6 }}>Records, allergies, medications and reminders for everyone you care for.</p>
      </div>

      <div className="grid2 rise d1">
        {MEMBERS.map((m) => {
          const id = m.name === 'Ananya' ? 'ananya' : m.name.startsWith('Papa') ? 'papa' : m.name.startsWith('Maa') ? 'maa' : '';
          const mstate = id ? state[id] : undefined;
          if (mstate?.removed) return null;
          return (
            <div className="card" key={m.name} style={mstate?.disabled ? { opacity: 0.55 } : undefined}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
                <div className="av" style={{ width: 48, height: 48 }}>{m.in}</div>
                <div><h4>{m.name}</h4><p className="muted" style={{ fontSize: 12 }}>{m.sub}</p></div>
              </div>
              <table className="tc"><tbody>
                {m.rows.map(([k, v], i) => <tr key={i}><td>{k}</td><td>{v}</td></tr>)}
              </tbody></table>
              <Link className="btn btn-sm btn-line" style={{ marginTop: 12 }} to="/medical/records">View records →</Link>
            </div>
          );
        })}
      </div>

      <section className="blk rise">
        <div className="blk-head"><h2>Manage members</h2><span className="muted" style={{ fontSize: 12 }}>Disable pauses sharing · Remove takes them off your profile</span></div>
        {live.length ? live.map((m) => {
          const dis = !!state[m.id]?.disabled;
          return (
            <div className="row" key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 8, ...(dis ? { opacity: 0.6 } : {}) }}>
              <div><b>{m.name}</b> <span className="muted" style={{ fontSize: 12 }}>· {m.rel}</span>{dis ? <span className="tag amber" style={{ marginLeft: 6 }}>Sharing paused</span> : <span className="tag green" style={{ marginLeft: 6 }}>Active</span>}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm btn-line" type="button" onClick={() => toggleDisabled(m.id)}>{dis ? 'Enable' : 'Disable'}</button>
                <button className="btn btn-sm btn-line" type="button" onClick={() => remove(m.id)}>Remove</button>
              </div>
            </div>
          );
        }) : <p className="muted" style={{ fontSize: 13 }}>No family members connected. Add one below.</p>}
      </section>

      <div className="note rise d2">◈ Family Profiles share the same TC-ID connection system as Family Nutrition — one connection powers meal plans, reminders and records together.</div>

      <div className="trust">
        <span>◈ 4 Members Connected</span><span>◈ Medication Reminders</span><span>◈ Shared Allergy Alerts</span><span>◈ Private by Default</span>
      </div>

      <section className="blk rise">
        <div className="blk-head"><h2>Connect a family member</h2></div>
        <div className="card">
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Search by their Together City username to connect profiles — shared reminders, allergy alerts &amp; records (consent-gated, private by default).</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); connect(); } }} type="text" placeholder="@username"
              style={{ flex: 1, minWidth: 200, border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }} />
            <button className="btn btn-accent" type="button" onClick={connect}>Search &amp; connect</button>
          </div>
          <div style={{ marginTop: 14 }}>
            {invites.length ? invites.map((x, i) => (
              <div className="row" key={x.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 14px', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 8 }}>
                <div><b>@{x.username}</b> <span className={`tag ${x.status === 'Connected' ? 'green' : 'amber'}`} style={{ marginLeft: 6 }}>{x.status}</span></div>
                <button className="btn btn-sm btn-line" type="button" onClick={() => setInvites((v) => v.filter((_, j) => j !== i))}>Remove</button>
              </div>
            )) : <p className="muted" style={{ fontSize: 13 }}>No family members connected yet.</p>}
          </div>
        </div>
      </section>
    </>
  );
}

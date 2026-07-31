import { useEffect, useState } from 'react';
import { TrustBar } from '../shared';

interface Friend { name: string; handle: string; color: string }
interface Group { id: string; name: string; type: string; members: string[] }

const FRIENDS: Friend[] = [
  { name: 'Aarav Mehta', handle: '@aaravm', color: '#b0503e' },
  { name: 'Sana Kapoor', handle: '@sanak', color: '#3a6ea5' },
  { name: 'Kabir Nair', handle: '@kabirn', color: '#2e5c3f' },
  { name: 'Rhea Sharma', handle: '@rhea', color: '#7a4fa0' },
  { name: 'Meera Iyer', handle: '@meera', color: '#b08d3e' },
  { name: 'Dev Patel', handle: '@devp', color: '#b76e79' },
  { name: 'Nisha Rao', handle: '@nishar', color: '#4a6b8a' },
  { name: 'Arjun Kapoor', handle: '@arjunk', color: '#8a5a2e' },
];
const TYPES = ['School Friends', 'Family', 'College', 'Others'];
const KEY = 'tc:travel:groups';

const SEED: Group[] = [
  { id: 'g_school', name: 'School Friends', type: 'School Friends', members: ['@aaravm', '@sanak', '@devp'] },
  { id: 'g_family', name: 'Family', type: 'Family', members: ['@rhea', '@meera'] },
  { id: 'g_college', name: 'College', type: 'College', members: ['@kabirn', '@nishar', '@arjunk'] },
];

function load(): Group[] {
  try { const g = JSON.parse(localStorage.getItem(KEY) ?? ''); if (Array.isArray(g)) return g as Group[]; } catch { /* seed below */ }
  return SEED;
}
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function friend(handle: string): Friend {
  return FRIENDS.find((f) => f.handle === handle) ?? { name: handle, handle, color: '#888' };
}

const inputStyle: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' };
const flStyle: React.CSSProperties = { display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', fontWeight: 600, marginBottom: 5 };

export function TravelConnect() {
  const [groups, setGroups] = useState<Group[]>(load);
  const [name, setName] = useState('');
  const [type, setType] = useState(TYPES[0]);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(groups)); } catch { /* ignore */ } }, [groups]);

  const addGroup = () => {
    const n = name.trim();
    if (!n) return;
    setGroups((g) => [...g, { id: 'g' + Date.now(), name: n, type, members: [] }]);
    setName('');
  };
  const deleteGroup = (id: string) => setGroups((g) => g.filter((x) => x.id !== id));
  const toggleMember = (id: string, handle: string) =>
    setGroups((g) => g.map((grp) => grp.id !== id ? grp : {
      ...grp, members: grp.members.includes(handle) ? grp.members.filter((h) => h !== handle) : [...grp.members, handle],
    }));

  return (
    <>
      <div className="rise" style={{ marginBottom: 20 }}>
        <div className="eyebrow">Travel Hub · 09</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Connect Friends</h1>
        <p className="lede" style={{ marginTop: 6 }}>Group your people — School Friends, Family, College and more — then share any flight, hotel or train straight to a person or a whole group.</p>
      </div>

      <section className="blk rise d1">
        <div className="blk-head"><h2>Create a group</h2></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 20 }}>
            <div><label style={flStyle}>Group name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa trip 2026" style={inputStyle} /></div>
            <div><label style={flStyle}>Type</label><select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <button className="btn btn-gold" type="button" onClick={addGroup}>+ Create group</button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Then tap members below to add them. Groups are private to you.</p>
        </div>
      </section>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Your groups</h2><span className="muted" style={{ fontSize: 12 }}>{groups.length} group{groups.length === 1 ? '' : 's'}</span></div>
        {groups.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No groups yet — create one above (School Friends, Family, College…).</p>
        ) : groups.map((g) => (
          <div key={g.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 14, background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="av" style={{ width: 40, height: 40, fontSize: 16, background: 'var(--accent-soft)', color: 'var(--accent)' }}>👥</div>
              <div style={{ flex: 1, minWidth: 160 }}><h4 style={{ margin: 0, fontSize: 15 }}>{g.name}</h4><div className="muted" style={{ fontSize: 12 }}>{g.members.length} member{g.members.length === 1 ? '' : 's'}</div></div>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '3px 9px', borderRadius: 999 }}>{g.type}</span>
              <button className="btn btn-line btn-sm" type="button" onClick={() => deleteGroup(g.id)}>Delete</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginTop: 12 }}>
              {FRIENDS.map((f) => {
                const on = g.members.includes(f.handle);
                const fr = friend(f.handle);
                return (
                  <div key={f.handle} onClick={() => toggleMember(g.id, f.handle)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, border: on ? '1px solid var(--accent)' : '1px solid var(--line)', background: on ? 'var(--accent-soft)' : undefined, borderRadius: 10, padding: '7px 10px', cursor: 'pointer', fontSize: 12.5 }}>
                    <div className="av" style={{ width: 30, height: 30, fontSize: 11, flex: '0 0 auto', background: fr.color, color: '#fff' }}>{initials(fr.name)}</div>
                    <span>{f.name.split(' ')[0]}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)' }}>{on ? '✓' : '+'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <TrustBar items={['Private groups', 'Share flights, hotels & trains', 'Send to one or many']} />
    </>
  );
}

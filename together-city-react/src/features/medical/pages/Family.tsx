import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Invite { username: string; status: string }

/** Family Profiles — connect family members to share reminders, allergy alerts &
 *  records (consent-gated). Starts empty; real members are added via connect. */
export function Family() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [search, setSearch] = useState('');

  const connect = () => {
    const u = search.trim().replace(/^@/, '');
    if (!u || invites.some((x) => x.username.toLowerCase() === u.toLowerCase())) return;
    setInvites((v) => [{ username: u, status: 'Invited' }, ...v]);
    setSearch('');
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Family Profiles</div>
      <h1 style={{ fontSize: 26 }}>Family Profiles</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Connect the people you care for to share medication reminders, allergy alerts and records —
        consent-gated and private by default.
      </p>

      {/* Connected members */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Connected members</div>
        {invites.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            No family members connected yet. Add someone below to get started.
          </p>
        ) : (
          invites.map((x, i) => (
            <div key={x.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13.5 }}>
                <b>@{x.username}</b>
                <span className="pill" style={{ marginLeft: 8, border: '1px solid var(--line)', borderRadius: 999, padding: '1px 9px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{x.status}</span>
              </div>
              <button type="button" onClick={() => setInvites((v) => v.filter((_, j) => j !== i))}
                style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#c62828', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {/* Connect a family member */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Connect a family member</div>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
          Search by their Together City username to connect profiles — shared reminders, allergy alerts and records, consent-gated.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); connect(); } }}
            type="text" placeholder="@username"
            style={{ flex: 1, minWidth: 200, border: '1.5px solid var(--line)', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
          <button className="btn btn-accent btn-sm" type="button" onClick={connect}>Search &amp; connect</button>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
        ◈ Family Profiles use the same Together City connection system as Family Nutrition — one connection powers meal plans, reminders and records together. <Link to="/medical/records" style={{ color: 'var(--accent)', fontWeight: 600 }}>View your records →</Link>
      </p>
    </div>
  );
}

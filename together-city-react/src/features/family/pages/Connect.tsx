import { useState } from 'react';
import { Hero, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useFamily, connectedMembers, activeMembers, headcount, MEMBERS } from '../members';

const pillInput: React.CSSProperties = {
  flex: 1, minWidth: 200, border: '1px solid var(--line)', borderRadius: 999,
  padding: '12px 18px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)',
  outline: 'none', fontFamily: 'inherit',
};

/** Connect Family Members (family-connect.html) — consent-gated linking, guests, roles. */
export function FamilyConnect() {
  const { user } = useAuth();
  const { state, addGuest, removeGuest } = useFamily();
  const [guestName, setGuestName] = useState('');

  const youName = user?.name ?? 'You';
  const connectedCount = connectedMembers(state).length - 1; // exclude admin (you)
  const N = headcount(state);
  const active = activeMembers(state).map((m) => m.id);

  const submitGuest = () => {
    const nm = guestName.trim();
    if (!nm) return;
    addGuest(nm);
    setGuestName('');
  };

  return (
    <div>
      <Hero image="/assets/img/nutrition-hub--main-pages--family--connect-family.webp" eyebrow="Family Nutrition · 01"
        title="Connect Family Members"
        sub="Link Together IDs so meal plans, grocery lists and health insights can be shared with consent." />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 12 }}>Add with Together City ID</h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input placeholder="Enter Together City ID, e.g. TC-00031452" style={pillInput} />
              <Button variant="accent" size="sm">Send Request →</Button>
            </div>
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>Send Request → they Accept → you're Connected. Or invite by phone number instead.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <input placeholder="+91 phone number" style={pillInput} />
              <Button variant="line" size="sm">Invite via SMS</Button>
            </div>
          </div>

          <div style={{ marginBottom: 4 }}><h2>Connected Members ({connectedCount})</h2></div>
          <p className="note" style={{ margin: '0 0 16px', fontSize: 12.5 }}>
            🍳 Family meals are currently cooked for <b>{N} {N === 1 ? 'person' : 'people'}</b> (you + active members + guests). Pause anyone travelling or add a guest — plans re-portion automatically.
          </p>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 4px', borderBottom: '1px solid var(--line)' }}>
              <div className="av">{(youName[0] || 'Y').toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{youName} <span className="tag green" style={{ marginLeft: 6 }}>You · Admin</span></div>
                <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>You manage the family group and always count in the headcount.</div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12.5, padding: '14px 4px 4px' }}>
              No other family members yet — add someone by their Together City ID above, and once they accept they’ll appear here.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 32, marginBottom: 8 }}>
            <h2>Guests</h2><span className="meta">Added to the headcount · removed anytime</span>
          </div>
          <div className="card">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitGuest(); } }}
                placeholder="Guest name"
                style={{ flex: 1, minWidth: 200, border: '1px solid var(--line)', borderRadius: 10, padding: '11px 14px', fontFamily: 'inherit', fontSize: 14, background: 'var(--card)', color: 'var(--ink)' }} />
              <Button variant="accent" size="sm" onClick={submitGuest}>+ Add guest</Button>
            </div>
            {state.guests.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px' }}>
                <div className="av" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{(g.name[0] || 'G').toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{g.name} <span className="tag amber" style={{ marginLeft: 6 }}>Guest</span></div>
                  <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Counted in the family headcount</div>
                </div>
                <Button variant="line" size="sm" style={{ color: '#b0503e' }} onClick={() => removeGuest(g.id)}>Remove</Button>
              </div>
            ))}
            {state.guests.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No guests right now — add one and every family plan cooks for them too.</p>
            )}
          </div>

          <div style={{ marginTop: 32, marginBottom: 8 }}><h2>Pending Invites</h2></div>
          <div className="card">
            <p className="muted" style={{ fontSize: 12.5, padding: '4px' }}>No pending invites. Requests you send appear here until they’re accepted.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: 'var(--accent-soft)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
            <div>
              <p className="meta" style={{ display: 'block', marginBottom: 2 }}>Your Together City ID</p>
              <b style={{ fontSize: 15 }}>TC-00024891</b>
            </div>
            <Button variant="line" size="sm">Share</Button>
          </div>
          <div className="card">
            <h4>Privacy &amp; Permissions</h4>
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>Connected members share meal plans, grocery lists and health insights within this family group. As Admin, you manage who can view or edit each profile — nothing is shared outside the family without explicit consent.</p>
          </div>
          <div className="card">
            <h4>Roles</h4>
            <div className="rows" style={{ marginTop: 12 }}>
              <div className="row" style={{ boxShadow: 'none', padding: '10px 12px' }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{youName}</div><div className="muted" style={{ fontSize: 12 }}>Admin — full access</div></div>
              </div>
              <div className="row" style={{ boxShadow: 'none', padding: '10px 12px' }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13 }} className="muted">Family members you add</div><div className="muted" style={{ fontSize: 12 }}>Members — view &amp; edit own profile</div></div>
              </div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>Active in meals right now: {active.length} of {MEMBERS.length} {MEMBERS.length === 1 ? 'member' : 'members'}.</div>
        </div>
      </div>
    </div>
  );
}

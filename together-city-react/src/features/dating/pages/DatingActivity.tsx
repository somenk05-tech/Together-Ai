import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useDatingProfile } from '../api';
import {
  CANDIDATES, CATEGORY_ICON, ME, SEED_ACTIVITIES, initials,
  type Activity, type Joiner,
} from '../datingStatic';

type Tab = 'discover' | 'create' | 'mine' | 'joined';

const TABS: { key: Tab; label: string }[] = [
  { key: 'discover', label: 'Discover plans' },
  { key: 'create', label: '+ Post a plan' },
  { key: 'mine', label: 'My plans' },
  { key: 'joined', label: 'Joined' },
];

const acat: CSSProperties = {
  width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
};
const ameta: CSSProperties = { fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap', margin: '6px 0' };
const anote: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' };
const fl: CSSProperties = { fontSize: 12.5, fontWeight: 600, display: 'block', margin: '12px 0 6px' };
const fi: CSSProperties = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px',
  fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
};
const reqcard: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--line)',
  borderRadius: 12, padding: 12, marginTop: 10, background: 'var(--paper)',
};

function avatar(name: string, color: string) {
  return (
    <div className="av" style={{ background: color, color: '#fff' }}>{initials(name)}</div>
  );
}

function catIcon(category: string) {
  return CATEGORY_ICON[category] || '📍';
}

let seq = 0;

export function DatingActivity() {
  const profile = useDatingProfile();
  const [tab, setTab] = useState<Tab>('discover');
  const [activities, setActivities] = useState<Activity[]>(() => SEED_ACTIVITIES.map((a) => ({ ...a, joiners: [] })));

  const myJoin = (a: Activity): Joiner | null => a.joiners.find((j) => j.handle === ME.handle) ?? null;

  const discover = useMemo(() => activities.filter((a) => a.host.handle !== ME.handle), [activities]);
  const mine = useMemo(() => activities.filter((a) => a.host.handle === ME.handle), [activities]);
  const joined = useMemo(
    () => activities.filter((a) => a.host.handle !== ME.handle && a.joiners.some((j) => j.handle === ME.handle)),
    [activities],
  );

  function askToJoin(id: string) {
    setActivities((prev) => prev.map((a) => {
      if (a.id !== id || a.joiners.some((j) => j.handle === ME.handle)) return a;
      return { ...a, joiners: [...a.joiners, { name: ME.name, handle: ME.handle, color: ME.color, age: 0, city: ME.city, status: 'requested' }] };
    }));
  }

  function setJoinStatus(id: string, handle: string, status: Joiner['status']) {
    setActivities((prev) => prev.map((a) =>
      a.id === id ? { ...a, joiners: a.joiners.map((j) => (j.handle === handle ? { ...j, status } : j)) } : a,
    ));
  }

  function postPlan(draft: { category: string; title: string; when: string; place: string; note: string; spots: number }) {
    // Simulate incoming interest so the host approval flow is usable.
    const pool = [...CANDIDATES].sort(() => Math.random() - 0.5).slice(0, Math.min(2, draft.spots + 1));
    const joiners: Joiner[] = pool.map((c) => ({ name: c.name, handle: c.handle, color: c.color, age: c.age, city: c.city, status: 'requested' }));
    const created: Activity = {
      id: `act${Date.now()}${seq++}`,
      host: { name: ME.name, handle: ME.handle, color: ME.color, city: ME.city },
      ...draft, joiners,
    };
    setActivities((prev) => [created, ...prev]);
    setTab('mine');
  }

  if (profile.isLoading) return <Spinner label="Loading Activity Dating…" />;

  return (
    <>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/dating--855c2aae-901d-4aee-9934-6158cd4eaf10.webp" alt="" />
        <div className="inner">
          <div className="eyebrow">Dating Hub · Activity Dating</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Meet by doing, not swiping</h1>
          <p className="sub">Post a plan — a film, a comedy night, a weekend trip — and let compatible people ask to join. You choose who's in.</p>
        </div>
      </div>

      {!profile.data ? (
        <div className="empty" style={{ border: '1px dashed var(--line)', borderRadius: 18, background: 'var(--card)', marginTop: 20 }}>
          <div className="ic" style={{ opacity: 1 }}>🗓</div>
          <h3>Create your dating profile to post &amp; join plans</h3>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 16px' }}>Only members with a saved profile take part in Activity Dating.</p>
          <Link to="/dating/profile"><Button variant="gold">Create my profile</Button></Link>
        </div>
      ) : (
        <>
          <div className="rise" style={{ display: 'flex', gap: 8, margin: '16px 0 20px', flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button
                key={t.key} type="button" onClick={() => setTab(t.key)}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${tab === t.key ? 'var(--accent)' : 'var(--line)'}`,
                  background: tab === t.key ? 'var(--accent)' : 'var(--card)',
                  color: tab === t.key ? '#fff' : 'var(--ink)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rise">
            {tab === 'discover' && (
              discover.length ? discover.map((a) => (
                <DiscoverCard key={a.id} activity={a} mine={myJoin(a)} onJoin={() => askToJoin(a.id)} />
              )) : (
                <div className="empty" style={{ border: '1px dashed var(--line)', borderRadius: 18, background: 'var(--card)' }}>
                  No plans posted yet. Be the first — <button type="button" className="linklike" onClick={() => setTab('create')} style={linkBtn}>post a plan</button>.
                </div>
              )
            )}

            {tab === 'create' && <CreateForm onPost={postPlan} />}

            {tab === 'mine' && (
              mine.length ? mine.map((a) => (
                <MineCard key={a.id} activity={a} onAllow={(h) => setJoinStatus(a.id, h, 'approved')} onDecline={(h) => setJoinStatus(a.id, h, 'declined')} />
              )) : (
                <div className="empty" style={{ border: '1px dashed var(--line)', borderRadius: 18, background: 'var(--card)' }}>
                  You haven't posted a plan yet. <button type="button" onClick={() => setTab('create')} style={linkBtn}>Post one</button> and let compatible people ask to join.
                </div>
              )
            )}

            {tab === 'joined' && (
              joined.length ? joined.map((a) => <JoinedCard key={a.id} activity={a} join={myJoin(a)!} />) : (
                <div className="empty" style={{ border: '1px dashed var(--line)', borderRadius: 18, background: 'var(--card)' }}>
                  You haven't joined any plans yet. Check <button type="button" onClick={() => setTab('discover')} style={linkBtn}>Discover</button>.
                </div>
              )
            )}
          </div>
        </>
      )}
    </>
  );
}

const linkBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0, textDecoration: 'underline' };

function CardHead({ activity, subtitle }: { activity: Activity; subtitle: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
      <div style={acat}>{catIcon(activity.category)}</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{activity.title}</h3>
        <div className="muted" style={{ fontSize: 12 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function DiscoverCard({ activity, mine, onJoin }: { activity: Activity; mine: Joiner | null; onJoin: () => void }) {
  return (
    <article className="card" style={{ marginBottom: 16 }}>
      <CardHead activity={activity} subtitle={`Hosted by ${activity.host.name} · ${activity.host.city}`} />
      <div style={ameta}>
        <span>🗓 {activity.when}</span>
        <span>📍 {activity.place}</span>
        <span>👥 {activity.spots} spot{activity.spots === 1 ? '' : 's'}</span>
      </div>
      {activity.note && <div style={anote}>{activity.note}</div>}
      <div style={{ marginTop: 6 }}>
        {mine ? (
          <Button variant="line" size="sm" disabled>{mine.status === 'approved' ? "✓ You're in" : 'Requested — awaiting host'}</Button>
        ) : (
          <Button variant="gold" size="sm" onClick={onJoin}>Ask to join</Button>
        )}
      </div>
    </article>
  );
}

function MineCard({ activity, onAllow, onDecline }: { activity: Activity; onAllow: (h: string) => void; onDecline: (h: string) => void }) {
  const reqs = activity.joiners.filter((j) => j.status === 'requested');
  const appr = activity.joiners.filter((j) => j.status === 'approved');
  return (
    <article className="card" style={{ marginBottom: 16 }}>
      <CardHead activity={activity} subtitle={`Your plan · ${activity.when} · ${activity.place}`} />
      {reqs.length ? (
        <>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{reqs.length} wants to join — review their profile:</p>
          {reqs.map((j) => {
            const cand = CANDIDATES.find((c) => c.handle === j.handle);
            return (
              <div key={j.handle} style={reqcard}>
                {avatar(j.name, j.color)}
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{j.name}, {j.age}</b>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {j.city}
                    {cand && <> · <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{cand.matchScore}% match</span>{cand.badge ? ` · ${cand.badge}` : ''}</>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="gold" size="sm" onClick={() => onAllow(j.handle)}>Allow</Button>
                  <Button variant="line" size="sm" onClick={() => onDecline(j.handle)}>Pass</Button>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No pending requests yet.</p>
      )}
      {appr.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Confirmed:</p>
          {appr.map((j) => (
            <div key={j.handle} style={reqcard}>
              {avatar(j.name, j.color)}
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13.5 }}>{j.name}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>Plan confirmed ✓</div>
              </div>
              <Link to={`/dating/chat?u=${encodeURIComponent(j.handle)}`}><Button variant="line" size="sm">Message</Button></Link>
            </div>
          ))}
        </>
      )}
    </article>
  );
}

function JoinedCard({ activity, join }: { activity: Activity; join: Joiner }) {
  const approved = join.status === 'approved';
  return (
    <article className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <div style={acat}>{catIcon(activity.category)}</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>{activity.title}</h3>
          <div className="muted" style={{ fontSize: 12 }}>{activity.host.name} · {activity.when}</div>
        </div>
        <span className="tag">{approved ? '✓ In' : 'Requested'}</span>
      </div>
      {approved ? (
        <Link to={`/dating/chat?u=${encodeURIComponent(activity.host.handle)}`} style={{ display: 'inline-block', marginTop: 6 }}>
          <Button variant="line" size="sm">Message host</Button>
        </Link>
      ) : (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Waiting for the host to review your profile.</p>
      )}
    </article>
  );
}

function CreateForm({ onPost }: { onPost: (draft: { category: string; title: string; when: string; place: string; note: string; spots: number }) => void }) {
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [spots, setSpots] = useState('1');
  const [err, setErr] = useState('');

  function submit() {
    if (!title.trim()) { setErr('Give your plan a title'); return; }
    onPost({
      category: category || 'Movie', title: title.trim(),
      when: when.trim() || 'TBD', place: place.trim() || 'TBD',
      note: note.trim(), spots: parseInt(spots, 10) || 1,
    });
  }

  return (
    <article className="card">
      <h3 style={{ marginBottom: 10 }}>Post a plan</h3>
      <label style={fl}>What's the plan?</label>
      <input style={fi} value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} placeholder="e.g. Let's watch Odyssey in IMAX" />

      <label style={fl}>Category</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {Object.keys(CATEGORY_ICON).map((c) => (
          <button
            key={c} type="button" onClick={() => setCategory(c)}
            style={{
              border: `1px solid ${category === c ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 999,
              padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: category === c ? 'var(--accent)' : 'transparent', color: category === c ? '#fff' : 'var(--ink)',
            }}
          >
            {CATEGORY_ICON[c]} {c}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={fl}>When</label><input style={fi} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Sat, 8:00 PM" /></div>
        <div><label style={fl}>Where</label><input style={fi} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Venue / area" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={fl}>Spots (people who can join)</label><input style={fi} type="number" min={1} value={spots} onChange={(e) => setSpots(e.target.value)} /></div>
      </div>
      <label style={fl}>Note</label>
      <input style={fi} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything joiners should know" />

      {err && <p style={{ color: 'var(--accent)', fontSize: 12.5, margin: '10px 0 0' }}>{err}</p>}
      <div style={{ marginTop: 16 }}><Button variant="gold" onClick={submit}>Post plan</Button></div>
    </article>
  );
}

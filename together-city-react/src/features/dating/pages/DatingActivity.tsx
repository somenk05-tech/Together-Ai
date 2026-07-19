import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import {
  useDatingProfile, useMyActivities, useActivityInvites, useCreateActivity, useRespondInvite, useActivityTrust,
  type AnonParty, type ReceivedInvite, type ActivityConnection,
} from '../api';

type Tab = 'create' | 'invites' | 'mine';
const CATEGORIES: [string, string][] = [['restaurant', '🍽 Restaurant'], ['theatre', '🎬 Theatre'], ['cafe', '☕ Café'], ['park', '🌳 Park'], ['city', '🏙 City'], ['any', '📍 Any location']];
const CAT_ICON: Record<string, string> = { restaurant: '🍽', theatre: '🎬', cafe: '☕', park: '🌳', city: '🏙', any: '📍' };
const GROUPS: [string, string][] = [['1', '1 person (a date)'], ['2-4', '2–4 people'], ['group', 'Group activity']];
const EXAMPLES = ['Watch the new Superman movie this Saturday.', 'Coffee this weekend?', 'Stand-up comedy tonight?', 'Morning walk at Cubbon Park.', 'Badminton partner every Sunday.'];

const fi: React.CSSProperties = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' };
const fl: React.CSSProperties = { fontSize: 12, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', margin: '14px 0 6px' };

function Avatar({ p }: { p: AnonParty }) {
  if (p.photo) return <img src={p.photo} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} />;
  return <div className="tc-avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{p.nickname.split(' ').map((w) => w[0]).join('')}</div>;
}

/** Anonymised connected party with trust-level controls. */
function ConnectedParty({ party, compatibility, trustLevel, conversationId, myReveal, myFriends, otherReveal, otherFriends, onTrust, busy }: {
  party: AnonParty; compatibility: number; trustLevel: number; conversationId: string | null; myReveal: boolean; myFriends: boolean; otherReveal: boolean; otherFriends: boolean;
  onTrust: (step: 'reveal' | 'friends') => void; busy: boolean;
}) {
  const displayName = trustLevel >= 2 && party.name ? party.name : party.nickname;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar p={party} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{displayName}{party.verified && <span title="Verified" style={{ marginLeft: 6, color: 'var(--accent)' }}>✓</span>}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{[party.age && `${party.age}`, party.sign, `${compatibility}%`].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="tag">Level {trustLevel}</span>
      </div>
      {trustLevel >= 2 && party.interests.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{party.interests.slice(0, 8).map((i) => <span key={i} className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', fontSize: 11.5 }}>{i}</span>)}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {conversationId && <Link to={`/chats?c=${conversationId}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>💬 {trustLevel < 2 ? 'Anonymous chat' : 'Open chat'} →</Link>}
        {trustLevel < 2 && <Button size="sm" variant={myReveal ? 'line' : 'accent'} disabled={busy || myReveal} onClick={() => onTrust('reveal')}>{myReveal ? (otherReveal ? 'Revealing…' : 'Waiting for them…') : 'Reveal identities'}</Button>}
        {trustLevel === 2 && <Button size="sm" variant={myFriends ? 'line' : 'accent'} disabled={busy || myFriends} onClick={() => onTrust('friends')}>{myFriends ? (otherFriends ? '…' : 'Waiting for them…') : 'Become friends'}</Button>}
        {trustLevel >= 3 && <span className="tag" style={{ background: '#e8f5e9', color: '#2e7d32' }}>✓ Friends — full profile unlocked</span>}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        {trustLevel === 1 ? 'Anonymous — real name, socials, phone & email stay hidden.'
          : trustLevel === 2 ? 'Real names, photos & interests are now visible to you both.'
          : 'You’re connected in Together City.'}
      </p>
    </div>
  );
}

function InviteCard({ inv }: { inv: ReceivedInvite }) {
  const respond = useRespondInvite();
  const trust = useActivityTrust();
  const a = inv.activity;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22 }}>{CAT_ICON[a.category] ?? '📍'}</span>
        <h3 style={{ fontSize: 16, margin: 0 }}>{a.text}</h3>
        <span style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--accent)' }}>{inv.compatibility}%</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 14, flexWrap: 'wrap', margin: '6px 0' }}>
        <span>📅 {new Date(a.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        {a.time && <span>🕖 {a.time}</span>}
        <span>{CAT_ICON[a.category]} {a.category}</span>
        <span>👥 {a.groupSize === '1' ? '1:1' : a.groupSize}</span>
      </div>
      {a.description && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 8px' }}>{a.description}</p>}
      <div className="muted" style={{ fontSize: 12 }}>From <strong>{inv.trustLevel >= 2 && inv.host.name ? inv.host.name : inv.host.nickname}</strong>{inv.host.verified && ' ✓'} · {[inv.host.age, inv.host.sign].filter(Boolean).join(' · ')} — host stays hidden until you both connect</div>

      {inv.status === 'pending' ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button size="sm" variant="accent" disabled={respond.isPending} onClick={() => respond.mutate({ id: inv.id, action: 'connect' })}>❤ Connect</Button>
          <Button size="sm" variant="line" disabled={respond.isPending} onClick={() => respond.mutate({ id: inv.id, action: 'pass' })}>Pass</Button>
        </div>
      ) : (
        <ConnectedParty party={inv.host} compatibility={inv.compatibility} trustLevel={inv.trustLevel} conversationId={inv.conversationId} myReveal={inv.myReveal} myFriends={inv.myFriends} otherReveal={inv.otherReveal} otherFriends={inv.otherFriends}
          busy={trust.isPending} onTrust={(step) => trust.mutate({ id: inv.id, step })} />
      )}
    </div>
  );
}

function CreateForm() {
  const create = useCreateActivity();
  const [text, setText] = useState('');
  const [category, setCategory] = useState('any');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [groupSize, setGroupSize] = useState('1');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState<number | null>(null);

  const submit = () => {
    if (text.trim().length < 3 || !date) return;
    create.mutate({ text: text.trim(), category, date, time: time || undefined, groupSize, description: description.trim() || undefined },
      { onSuccess: (r) => { setDone(r.invited); setText(''); setDescription(''); } });
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Create an activity</h3>
      <p className="muted" style={{ fontSize: 12.5 }}>Say what you want to do — the AI invites the most compatible people, and only they see it.</p>
      <span style={fl}>Activity</span>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLES[0]} style={fi} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{EXAMPLES.slice(1).map((e) => <button key={e} type="button" onClick={() => setText(e)} className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer', background: 'transparent' }}>{e}</button>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <div><span style={fl}>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fi} /></div>
        <div><span style={fl}>Time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={fi} /></div>
      </div>
      <span style={fl}>Location</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{CATEGORIES.map(([k, l]) => <button key={k} type="button" onClick={() => setCategory(k)} style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${category === k ? 'var(--accent)' : 'var(--line)'}`, background: category === k ? 'var(--accent)' : 'transparent', color: category === k ? '#fff' : 'var(--ink-soft)' }}>{l}</button>)}</div>
      <span style={fl}>Number of people</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{GROUPS.map(([k, l]) => <button key={k} type="button" onClick={() => setGroupSize(k)} style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${groupSize === k ? 'var(--accent)' : 'var(--line)'}`, background: groupSize === k ? 'var(--accent)' : 'transparent', color: groupSize === k ? '#fff' : 'var(--ink-soft)' }}>{l}</button>)}</div>
      <span style={fl}>Description</span>
      <textarea value={description} rows={3} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Looking for someone who enjoys good movies and better conversation…" style={{ ...fi, resize: 'vertical' }} />
      <div style={{ marginTop: 14 }}>
        <Button variant="accent" disabled={create.isPending || text.trim().length < 3 || !date} onClick={submit}>{create.isPending ? 'Finding people…' : 'Post & invite compatible people'}</Button>
      </div>
      {done !== null && <p style={{ color: 'var(--accent)', fontSize: 13, marginTop: 10 }}>{done > 0 ? `✨ Invited ${done} highly-compatible ${done === 1 ? 'person' : 'people'}. They appear under “My plans” as they connect.` : 'Posted — no strong matches right now, but the AI will invite people as more join.'}</p>}
    </div>
  );
}

/** Activity Dating — meet by doing, not swiping. */
export function DatingActivity() {
  const profile = useDatingProfile();
  const [tab, setTab] = useState<Tab>('create');
  const mine = useMyActivities();
  const invites = useActivityInvites();
  const trust = useActivityTrust();

  if (profile.isLoading) return <Spinner label="Loading…" />;
  if (!profile.data) {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
        <EmptyState icon="🌙" title="Create your dating profile first" hint="Activity dating uses your birth details and interests to invite compatible people." />
        <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/dating/profile"><Button variant="accent">Set up your profile →</Button></Link></div>
      </div>
    );
  }

  const pendingCount = invites.data?.filter((i) => i.status === 'pending').length;
  const TABS: [Tab, string, number | undefined][] = [['create', '+ Create', undefined], ['invites', 'Invitations', pendingCount], ['mine', 'My plans', mine.data?.length]];

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Dating Hub · Activity Dating</div>
      <h1 style={{ fontSize: 26 }}>Meet by doing, not swiping</h1>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>Post a plan; the AI invites your most compatible people. Connections stay anonymous until you both choose to reveal.</p>

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--line)', margin: '16px 0 18px' }}>
        {TABS.map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: '10px 14px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: tab === k ? 'var(--accent)' : 'var(--muted)', borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
            {l}{n ? <span className="tag" style={{ marginLeft: 6 }}>{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'create' && <CreateForm />}

      {tab === 'invites' && (
        invites.isLoading ? <Spinner /> :
        (invites.data ?? []).length === 0 ? <EmptyState icon="✉️" title="No invitations yet" hint="When someone posts a plan you’re compatible with, it appears here." />
          : invites.data?.map((inv) => <InviteCard key={inv.id} inv={inv} />)
      )}

      {tab === 'mine' && (
        mine.isLoading ? <Spinner /> :
        (mine.data ?? []).length === 0 ? <EmptyState icon="🗓" title="No plans yet" hint="Create an activity to get started." />
          : mine.data?.map((a) => (
            <div key={a.id} className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{CAT_ICON[a.category] ?? '📍'}</span>
                <h3 style={{ fontSize: 15.5, margin: 0 }}>{a.text}</h3>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{new Date(a.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{a.time ? ` · ${a.time}` : ''}</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.invited} invited · {a.connectedCount} connected</div>
              {a.connections.map((c: ActivityConnection) => (
                <ConnectedParty key={c.inviteId} party={c.party} compatibility={c.compatibility} trustLevel={c.trustLevel} conversationId={c.conversationId}
                  myReveal={c.myReveal} myFriends={c.myFriends} otherReveal={c.otherReveal} otherFriends={c.otherFriends}
                  busy={trust.isPending} onTrust={(step) => trust.mutate({ id: c.inviteId, step })} />
              ))}
            </div>
          ))
      )}
    </div>
  );
}

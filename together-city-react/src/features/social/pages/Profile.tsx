import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@/components/ui';
import { chatApi } from '@/api';
import { useConnections, useRequestConnection, useRespondConnection } from '@/api/connections.api';
import { profileApi } from '@/features/profile/api';
import { initials } from '../shared';
import {
  useMyProfile, useMyPosts, usePeopleSearch, usePublicProfile, useUpdateProfile,
  type MyProfile, type ProfilePost, type PersonResult, type PublicProfile, type Relationship,
} from '../myProfile.api';

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const PAY_PER_VIDEO = 100;
const DAILY_CAP = 15;

/** Resize a chosen image to a small square JPEG data URL (no external storage needed). */
function resizeToDataUrl(file: File, size = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

function Avatar({ src, name, size = 96 }: { src?: string | null; name: string; size?: number }) {
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--serif)', fontSize: size / 3, flexShrink: 0, background: 'var(--accent)' }}>
      {initials(name)}
    </div>
  );
}

/** Blue verified check — shown when the account's email is verified. */
function VerifiedBadge() {
  return (
    <span title="Verified member" aria-label="Verified" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#2f8fce', color: '#fff', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>✓</span>
  );
}

function StatCell({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <b style={{ fontSize: 20, display: 'block' }}>{n.toLocaleString('en-IN')}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}

/** One post in the profile grid — real media thumbnail, or a text-post card. */
function PostTile({ p }: { p: ProfilePost }) {
  const first = p.media[0];
  const isVideo = first?.kind === 'video';
  const src = first ? (first.thumbUrl || first.url) : null;
  return (
    <div style={{ aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', position: 'relative', background: 'var(--paper)' }}>
      {src ? (
        <img src={src} alt={p.text ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center', fontSize: 13, lineHeight: 1.4, color: '#fff', background: 'linear-gradient(140deg,var(--accent),#7a4fa0)' }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.feeling ? `${p.feeling} · ` : ''}{p.text || 'Post'}</span>
        </div>
      )}
      {isVideo && (
        <span style={{ position: 'absolute', inset: 0, margin: 'auto', width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111', fontSize: 18, paddingLeft: 3 }}>▶</span>
      )}
      {p.outdoor && <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 14 }}>📍</span>}
    </div>
  );
}

function PostsTab() {
  const posts = useMyPosts();
  const sentinel = useRef<HTMLDivElement>(null);
  const items = useMemo(() => posts.data?.pages.flatMap((pg) => pg.items) ?? [], [posts.data]);

  // Infinite scroll — fetch the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !posts.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !posts.isFetchingNextPage) void posts.fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [posts.hasNextPage, posts.isFetchingNextPage, posts]);

  if (posts.isLoading) return <Spinner label="Loading your posts…" />;

  const count = items.length;
  if (!count) {
    return (
      <div className="blk rise d1" style={{ textAlign: 'center', padding: '56px 24px', marginTop: 16 }}>
        <div style={{ fontSize: 38, marginBottom: 8 }}>🌆</div>
        <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>No posts yet</h2>
        <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>Share a photo, video or thought with your city.</p>
        <Link className="btn btn-accent btn-sm" to="/social/create">+ New post</Link>
      </div>
    );
  }

  return (
    <>
      <div className="blk-head rise d1" style={{ marginTop: 16 }}>
        <h2>Your posts</h2>
        <span className="muted" style={{ fontSize: 12 }}>{count} post{count === 1 ? '' : 's'}{posts.hasNextPage ? '+' : ''}</span>
      </div>
      <div className="rise d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {items.map((p) => (
          <Link key={p.id} to="/social/feed" style={{ position: 'relative', display: 'block' }}><PostTile p={p} /></Link>
        ))}
      </div>
      <div ref={sentinel} style={{ height: 1 }} />
      {posts.isFetchingNextPage && <div style={{ padding: 16 }}><Spinner /></div>}
    </>
  );
}

/** Connect / Accept / Message action for a person — shared by search rows and the profile modal. */
function ConnectButton({ id, handle, relationship }: { id: string; handle: string; relationship: Relationship }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const connections = useConnections();
  const requestConn = useRequestConnection();
  const respondConn = useRespondConnection();
  const [rel, setRel] = useState<Relationship>(relationship);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRel(relationship), [relationship]);

  const connect = async () => { try { await requestConn.mutateAsync(handle); setRel('pending_out'); } catch { /* keep state */ } };
  const accept = async () => {
    const row = (connections.data ?? []).find((c) => c.user.id === id && c.status === 'pending');
    if (!row) { navigate('/connections'); return; }
    try { await respondConn.mutateAsync({ id: row.id, accept: true }); setRel('accepted'); } catch { /* keep */ }
  };
  const message = async () => {
    setBusy(true);
    try {
      const conv = await chatApi.startDirect(handle);
      await qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      navigate(`/chats?c=${conv.id}`);
    } catch { /* connected users only */ } finally { setBusy(false); }
  };

  if (rel === 'accepted') return <Button variant="accent" size="sm" disabled={busy} onClick={message}>{busy ? '…' : 'Message'}</Button>;
  if (rel === 'pending_out') return <Button variant="line" size="sm" disabled>Requested</Button>;
  if (rel === 'pending_in') return <Button variant="accent" size="sm" disabled={respondConn.isPending} onClick={accept}>Accept</Button>;
  if (rel === 'blocked') return <Button variant="line" size="sm" disabled>Unavailable</Button>;
  return <Button variant="accent" size="sm" disabled={requestConn.isPending} onClick={connect}>Connect</Button>;
}

function PublicProfileModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  const q = usePublicProfile(handle);
  const p = q.data as PublicProfile | undefined;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.5)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(460px,94vw)', maxHeight: '86vh', overflow: 'auto' }}>
        {q.isLoading && <Spinner label="Loading profile…" />}
        {q.isError && <p className="muted" style={{ fontSize: 13 }}>Couldn't load that profile.</p>}
        {p && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <Avatar src={p.profileImage} name={p.name} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <h3 style={{ margin: 0, fontSize: 19 }}>{p.name}</h3>{p.verified && <VerifiedBadge />}
                </div>
                <div className="muted" style={{ fontSize: 12.5, fontFamily: 'monospace' }}>@{p.handle}</div>
                {p.city && <div className="muted" style={{ fontSize: 12 }}>📍 {p.city}</div>}
              </div>
            </div>
            {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '12px 0 0' }}>{p.bio}</p>}
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)' }}>{p.website.replace(/^https?:\/\//, '')}</a>}
            <div style={{ display: 'flex', gap: 22, margin: '14px 0' }}>
              <StatCell n={p.stats.posts} label="posts" />
              <StatCell n={p.stats.reputation} label="reputation" />
              <StatCell n={p.stats.cityPoints} label="city points" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="line" size="sm" onClick={onClose}>Close</Button>
              <ConnectButton id={p.id} handle={p.handle} relationship={p.relationship} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PeopleTab() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q), 220); return () => clearTimeout(t); }, [q]);
  const search = usePeopleSearch(dq);
  const results = (search.data ?? []) as PersonResult[];

  return (
    <div className="rise d1" style={{ marginTop: 16 }}>
      <div className="card" style={{ marginBottom: 14 }}>
        <h4 style={{ margin: '0 0 4px' }}>Find people</h4>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Search by name, @handle or Together City ID, then connect.</p>
        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 12, padding: '0 12px' }}>
          <span className="muted">🔍</span>
          <input value={q} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => setQ(e.target.value)} placeholder="Search name or @handle"
            style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 8px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
        </div>

        {dq.trim().length >= 2 && (
          <div style={{ marginTop: 12 }}>
            {search.isLoading && <Spinner />}
            {!search.isLoading && results.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No members match “{dq}”.</p>}
            {results.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderTop: '1px solid var(--line)' }}>
                <Avatar src={r.profileImage} name={r.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</span>{r.verified && <VerifiedBadge />}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    <span style={{ fontFamily: 'monospace' }}>@{r.handle}</span>{r.city ? ` · ${r.city}` : ''}
                  </div>
                </div>
                <Button variant="line" size="sm" onClick={() => setOpen(r.handle)}>View</Button>
                <ConnectButton id={r.id} handle={r.handle} relationship={r.relationship} />
              </div>
            ))}
          </div>
        )}
      </div>
      {open && <PublicProfileModal handle={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function EditProfileModal({ me, onClose }: { me: MyProfile; onClose: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(me.profileImage);
  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [bio, setBio] = useState(me.bio ?? '');
  const [city, setCity] = useState(me.city ?? '');
  const [website, setWebsite] = useState(me.website ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const data = await resizeToDataUrl(file);
      await profileApi.setAvatar(data);
      setPhoto(data);
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch { setErr('Could not update the photo — try a smaller image.'); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await update.mutateAsync({ name, handle, bio, city, website });
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(typeof msg === 'string' ? msg : 'Could not save — check your details and try again.');
    } finally { setBusy(false); }
  };

  const field: React.CSSProperties = { width: '100%', padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '12px 0 5px' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.5)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(500px,94vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="blk-head"><h3>Edit profile</h3></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <Avatar src={photo} name={name} size={64} />
          <div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="line" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>Change photo</Button>
            <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>Square JPG/PNG, saved instantly.</p>
          </div>
        </div>

        <label style={label}>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={field} maxLength={80} />

        <label style={label}>Handle</label>
        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 10, padding: '0 10px' }}>
          <span className="muted">@</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '11px 6px', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} maxLength={30} />
        </div>

        <label style={label}>Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} style={{ ...field, resize: 'vertical' }} placeholder="A line about you" />

        <label style={label}>City</label>
        <input value={city} onChange={(e) => setCity(e.target.value)} style={field} maxLength={80} placeholder="e.g. Mumbai" />

        <label style={label}>Website</label>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} style={field} placeholder="https://…" />

        {err && <p style={{ color: '#c0392b', fontSize: 12.5, marginTop: 12 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button variant="line" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="accent" size="sm" onClick={save} disabled={busy || !name.trim() || handle.length < 3}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  );
}

function EarnView({ posts }: { posts: ProfilePost[] }) {
  const videos = posts.filter((p) => p.media.some((m) => m.kind === 'video'));
  const dailyCapInr = PAY_PER_VIDEO * DAILY_CAP;
  const TOPICS = [
    'Your life & personal journey', 'Your daily routine', 'Food reviews & cooking', 'Restaurants & cafés',
    'Health & fitness', 'Beauty & skincare', 'Travel experiences', 'Movies & entertainment',
    'Career & work life', 'Personal growth', 'Family & friendships', 'Hobbies & passions',
  ];
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,var(--accent),#7a4fa0)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: '22px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '.05em' }}>Redeemable balance</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 38, lineHeight: 1 }}>{money(0)}</div>
        <div style={{ fontSize: 13, opacity: 0.95, marginTop: 2 }}>Earn by publishing eligible videos — up to {money(PAY_PER_VIDEO)} each, {money(dailyCapInr)}/day.</div>
      </div>

      <div className="card">
        <div className="blk-head"><h3>Turn your stories into earnings</h3></div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Share authentic videos about your life and interests while helping others discover Together City.
          Once reviewed &amp; approved, each eligible video (3+ minutes) can earn up to <b>{money(PAY_PER_VIDEO)}</b>.
        </p>
        <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
          <div><div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--accent)' }}>{videos.length}</div><div className="muted" style={{ fontSize: 11 }}>videos posted</div></div>
          <div><div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--accent)' }}>{money(0)}</div><div className="muted" style={{ fontSize: 11 }}>earned</div></div>
          <div><div style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--accent)' }}>{money(0)}</div><div className="muted" style={{ fontSize: 11 }}>redeemed</div></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="blk-head"><h3>What can you make videos about?</h3></div>
        <div style={{ marginTop: 10 }}>
          {TOPICS.map((t) => (
            <span key={t} style={{ display: 'inline-block', background: 'var(--surface-2,#f2eee9)', border: '1px solid var(--line,#e5ddd3)', borderRadius: 999, padding: '5px 11px', fontSize: 12, margin: '0 6px 6px 0' }}>{t}</span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="blk-head"><h3>Your videos</h3></div>
        {videos.length === 0
          ? <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No videos yet. Post a video to start earning.</p>
          : videos.map((v) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.text || v.feeling || 'Video post'}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>In review</span>
            </div>
          ))}
      </div>
    </div>
  );
}

type Tab = 'posts' | 'earn' | 'people';

/** Social Life · My Profile — real identity, stats, posts, People search & Post & Earn. */
export function SocialProfile() {
  const me = useMyProfile();
  const posts = useMyPosts();
  const [tab, setTab] = useState<Tab>('posts');
  const [editing, setEditing] = useState(false);
  const allPosts = useMemo(() => posts.data?.pages.flatMap((pg) => pg.items) ?? [], [posts.data]);

  if (me.isLoading) return <div style={{ padding: 40 }}><Spinner label="Loading your profile…" /></div>;
  if (me.isError || !me.data) {
    return <div style={{ maxWidth: 980, margin: '0 auto', padding: 40 }}><p className="muted">Couldn't load your profile. Reload to try again.</p></div>;
  }
  const p = me.data;
  const joined = new Date(p.memberSince).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <Avatar src={p.profileImage} name={p.name} size={96} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 7 }}>{p.name}{p.verified && <VerifiedBadge />}</h1>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setEditing(true)}>Edit profile</button>
            <Link className="btn btn-accent btn-sm" to="/social/create">+ New post</Link>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            <span style={{ fontFamily: 'monospace' }}>@{p.handle}</span> · Joined {joined}
          </p>
          {p.city && <p className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>📍 {p.city}</p>}
          {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 560 }}>{p.bio}</p>}
          {p.website && <p style={{ margin: '4px 0 0' }}><a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)' }}>{p.website.replace(/^https?:\/\//, '')}</a></p>}
          <div style={{ display: 'flex', gap: 26, margin: '12px 0 0' }}>
            <StatCell n={p.stats.posts} label="posts" />
            <StatCell n={p.stats.reputation} label="reputation" />
            <StatCell n={p.stats.cityPoints} label="city points" />
          </div>
        </div>
      </div>

      <div className="rise d1" style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
        <button type="button" className={`pill ${tab === 'posts' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('posts')}>Posts</button>
        <button type="button" className={`pill ${tab === 'earn' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('earn')}>💰 Post &amp; Earn</button>
        <button type="button" className={`pill ${tab === 'people' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('people')}>People</button>
      </div>

      {tab === 'posts' && <PostsTab />}
      {tab === 'earn' && <div className="rise d1" style={{ marginTop: 16 }}><EarnView posts={allPosts} /></div>}
      {tab === 'people' && <PeopleTab />}

      {editing && <EditProfileModal me={p} onClose={() => setEditing(false)} />}
    </div>
  );
}

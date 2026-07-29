import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import { useProfileSummary, useProfileCompletion, useHealthScore } from '../hooks';
import { profileApi } from '../api';
import { useWebPush } from '@/hooks/useWebPush';
import { useConnections, useRespondConnection, useUnreadChatCount, useIncomingRequestCount } from '@/api';
import { useMailAccount } from '@/features/mail/api';

type Tab = 'overview' | 'photo' | 'notifications';

/** Round avatar — the uploaded photo (data URL) or the user's initials. */
function Avatar({ src, name, size = 56 }: { src?: string | null; name: string; size?: number }) {
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div className="tc-avatar" style={{ width: size, height: size, fontSize: size / 3, flexShrink: 0 }}>
      {(name || 'You').slice(0, 2).toUpperCase()}
    </div>
  );
}

/**
 * A wellness summary of recorded measurements.
 *
 * Renders the three states honestly rather than flattening them into a number:
 * `computed` shows the score, `incomplete` says what is missing and shows none,
 * and `unavailable` says nothing has been recorded yet. A component the citizen
 * has not filled in is listed as not counted — never as a zero dragging the
 * total down.
 */
function HealthScoreCard() {
  const q = useHealthScore();
  const d = q.data;
  if (!d) return null;

  const pct = d.score ?? 0;
  const ring = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--line) 0deg)`;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {d.state === 'computed' ? (
          <div style={{ position: 'relative', width: 68, height: 68, flex: 'none', borderRadius: '50%', background: ring, display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800 }}>{d.score}</div>
          </div>
        ) : (
          <div style={{ width: 68, height: 68, flex: 'none', borderRadius: '50%', border: '2px dashed var(--line)', display: 'grid', placeItems: 'center', fontSize: 22 }}>—</div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            Wellness summary{d.band ? ` · ${d.band}` : ''}
          </h3>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0', lineHeight: 1.55 }}>{d.basis}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '10px 16px', marginTop: 16 }}>
        {d.components.map((c) => (
          <div key={c.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span className="muted">{c.state === 'computed' ? c.value : 'not counted'}</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'var(--line)' }}>
              <div style={{ height: 5, borderRadius: 999, width: `${c.state === 'computed' ? (c.value ?? 0) : 0}%`, background: c.state === 'computed' ? 'var(--accent)' : 'transparent' }} />
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{c.detail}</div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 11, lineHeight: 1.55, marginTop: 14 }}>{d.disclaimer}</p>
    </Card>
  );
}

/** ONE profile-completion score across all hubs, with per-hub progress bars and
 *  quick links to finish whatever's incomplete. Enter info once; every hub
 *  reuses it, and this stays current after any save. */
function ProfileCompletionCard() {
  const q = useProfileCompletion();
  const d = q.data;
  if (!d) return null;
  const pct = Math.max(0, Math.min(100, d.percent));
  const ring = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--line) 0deg)`;
  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 68, height: 68, flex: 'none', borderRadius: '50%', background: ring, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800 }}>{pct}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Profile completion</h3>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>
            {d.complete ? 'Your profile is complete across every hub.' : 'One profile, reused across every hub — finish the rest to unlock better results.'}
          </p>
          {d.nextUp.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {d.nextUp.map((n) => (
                <Link key={n.key} to={n.href} className="tag" style={{ textDecoration: 'none' }}>Complete {n.label} →</Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '10px 16px', marginTop: 16 }}>
        {d.sections.map((s) => (
          <Link key={s.key} to={s.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              <span className="muted">{s.complete ? '✓' : `${s.percent}%`}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ width: `${s.percent}%`, height: '100%', background: s.complete ? '#2e7d4f' : 'var(--accent)' }} />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** Resize a chosen image to a small square JPEG data URL (no external storage needed). */
function resizeToDataUrl(file: File, size = 200): Promise<string> {
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

function PhotoTab({ current, name }: { current: string | null; name: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const dataUrl = await resizeToDataUrl(file);
      await profileApi.setAvatar(dataUrl);
      setPreview(dataUrl);
      // Reflect immediately in the app-wide avatar.
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, profileImage: dataUrl } : s.user }));
      void qc.invalidateQueries({ queryKey: ['profile', 'summary'] });
      setMsg('Photo updated ✓');
    } catch {
      setMsg('Couldn’t set that photo — try a smaller image.');
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <h4 style={{ margin: '0 0 4px' }}>Profile photo</h4>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>This appears across Together City — in chat, connections and your profile.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <Avatar src={preview} name={name} size={96} />
        <div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="accent" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : preview ? 'Change photo' : 'Upload a photo'}
          </Button>
          {msg && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{msg}</p>}
        </div>
      </div>
    </Card>
  );
}

function NotificationsTab() {
  const push = useWebPush();
  const connections = useConnections();
  const respond = useRespondConnection();
  const incoming = (connections.data ?? []).filter((c) => c.status === 'pending' && c.incoming);
  const unreadChats = useUnreadChatCount();
  const mail = useMailAccount();
  const unreadMail = mail.data?.counts.inboxUnread ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Push opt-in */}
      {push.supported && (
        <Card style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h4 style={{ margin: '0 0 4px' }}>🔔 Message notifications</h4>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {push.permission === 'granted' ? 'On — you’ll be notified of new messages even with the app closed.'
                : push.permission === 'denied' ? 'Blocked in your browser settings — allow notifications for this site to enable.'
                : 'Get notified of new messages even when Together City is closed.'}
            </p>
          </div>
          {push.permission !== 'granted' && push.permission !== 'denied' && (
            <Button variant="accent" size="sm" disabled={push.busy} onClick={push.enable}>{push.busy ? 'Enabling…' : 'Enable'}</Button>
          )}
          {push.permission === 'granted' && <span className="tag" style={{ alignSelf: 'center' }}>Enabled</span>}
        </Card>
      )}

      {/* Connection requests */}
      <Card>
        <h4 style={{ margin: '0 0 10px' }}>Connection requests {incoming.length > 0 && <span className="tag">{incoming.length}</span>}</h4>
        {incoming.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No pending requests.</p>
        ) : incoming.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <Avatar src={c.user.profileImage} name={c.user.name} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.user.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>@{c.user.handle} wants to connect</div>
            </div>
            <Button size="sm" variant="accent" disabled={respond.isPending} onClick={() => respond.mutate({ id: c.id, accept: true })}>Accept</Button>
            <Button size="sm" variant="line" disabled={respond.isPending} onClick={() => respond.mutate({ id: c.id, accept: false })}>Decline</Button>
          </div>
        ))}
      </Card>

      {/* Unread */}
      <Card>
        <h4 style={{ margin: '0 0 10px' }}>Unread</h4>
        <Link to="/chats" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)', color: 'inherit' }}>
          <span>💬 Chat messages</span>
          <span style={{ fontWeight: 700, color: unreadChats ? 'var(--accent)' : 'var(--muted)' }}>{unreadChats || 'None'}</span>
        </Link>
        <Link to="/mail/inbox" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)', color: 'inherit' }}>
          <span>✉ Mail</span>
          <span style={{ fontWeight: 700, color: unreadMail ? 'var(--accent)' : 'var(--muted)' }}>{unreadMail || 'None'}</span>
        </Link>
      </Card>
    </div>
  );
}

/** Center-crop + downscale a chosen image to a square JPEG data URL. */
function resizeAvatar(file: File, size = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return; }
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

/** Unified profile — identity, all cross-hub data, photo and notifications. */
export function Profile() {
  const { user, signOut } = useAuth();
  const { data, isLoading, isError } = useProfileSummary();
  const [tab, setTab] = useState<Tab>('overview');
  const reqCount = useIncomingRequestCount();
  const qc = useQueryClient();
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoOverride, setPhotoOverride] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const name = user?.name ?? 'You';
  const photo = photoOverride ?? data?.profileImage ?? user?.profileImage ?? null;

  const changePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const data64 = await resizeAvatar(file);
      const res = await profileApi.setAvatar(data64);
      const nextPhoto = res?.profileImage ?? data64;
      setPhotoOverride(nextPhoto);
      // Update the auth store so the header/master avatar refreshes everywhere.
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, profileImage: nextPhoto } : s.user }));
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      void qc.invalidateQueries({ queryKey: ['profile', 'summary'] });
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch { /* ignore — keep old photo */ } finally { setPhotoBusy(false); }
  };
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'photo', label: 'Photo' },
    { key: 'notifications', label: 'Notifications', badge: reqCount },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 24px 80px' }}>
      <div className="eyebrow">Together City</div>
      <h1 style={{ marginBottom: 18 }}>Your profile</h1>

      {/* Identity */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
          <button type="button" onClick={() => photoRef.current?.click()} disabled={photoBusy}
            aria-label="Change profile picture" title="Change profile picture"
            style={{ position: 'relative', border: 'none', background: 'none', padding: 0, cursor: photoBusy ? 'wait' : 'pointer', borderRadius: '50%', flexShrink: 0 }}>
            <Avatar src={photo} name={name} size={56} />
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, border: '2px solid var(--card,#fff)' }}>
              {photoBusy ? '…' : '📷'}
            </span>
          </button>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h3 style={{ margin: 0 }}>{name}</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              @{user?.handle ?? '—'}{user?.handle ? ` · ${user.handle}@togethercity.app` : ''}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              {data ? `Member since ${new Date(data.memberSince).toLocaleDateString()}` : 'Your Together City identity'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="line" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </Card>

      {/* One completion score across every hub profile */}
      <ProfileCompletionCard />
      <HealthScoreCard />

      {/* Quick access — Calendar lives here now (moved out of the top bar) */}
      <Link to="/calendar" className="card lift" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: 22 }}>🗓</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Calendar</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>Your appointments, bookings and reminders across the city.</p>
        </div>
        <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Open →</span>
      </Link>

      {/* Astrology Profile — the shared birth-details profile (Astrology Zone,
          dating matchmaking, compatibility reports all read from it) */}
      <Link to="/profile/astrology" className="card lift" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: 22 }}>🔭</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Astrology Profile</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>Birth date, time and place — entered once, used by horoscopes, matchmaking and compatibility.</p>
        </div>
        <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Open →</span>
      </Link>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: '10px 14px', fontFamily: 'inherit',
              fontSize: 14, fontWeight: 600, color: tab === t.key ? 'var(--accent)' : 'var(--muted)',
              borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
            {t.label}
            {t.badge ? <span className="tag" style={{ marginLeft: 6, background: '#e0342b', color: '#fff' }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <h4 style={{ margin: '4px 0 12px' }}>Your data across Together City</h4>
          {isLoading && <Spinner />}
          {isError && <EmptyState title="Couldn't load your data" hint="Reload in a moment." />}
          {data && data.hubs.length === 0 && (
            <EmptyState icon="✨" title="A fresh identity" hint="As you use each hub, what it knows about you appears here." />
          )}
          {data && data.hubs.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14, marginBottom: 24 }}>
              {data.hubs.map((h) => (
                <Link key={h.hub} to={h.href} className="card lift" style={{ display: 'block' }}>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>{h.label}</div>
                  <p style={{ fontSize: 13 }}>{h.summary}</p>
                </Link>
              ))}
            </div>
          )}
          {data && data.sections.length > 0 && (
            <Card>
              {data.sections.map((s) => (
                <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--line)' }}>
                  <span className="muted" style={{ fontSize: 13 }}>{s.label}</span>
                  <span style={{ fontSize: 13.5, color: s.value ? 'var(--ink)' : 'var(--muted)' }}>{s.value ?? 'Not set'}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'photo' && <PhotoTab current={photo} name={name} />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  );
}

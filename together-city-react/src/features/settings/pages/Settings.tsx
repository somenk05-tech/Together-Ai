import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWebPush } from '@/hooks/useWebPush';
import { Card, Button } from '@/components/ui';
import { authApi, type SessionInfo } from '@/api/auth.api';

/** A neutral, self-contained on/off switch (on-device preference). */
function Switch({ on, onChange, disabled }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      style={{
        width: 44, height: 26, borderRadius: 999, border: 'none', flexShrink: 0, cursor: disabled ? 'default' : 'pointer',
        background: on ? 'var(--accent)' : 'var(--line)', opacity: disabled ? 0.5 : 1, position: 'relative', transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s',
      }} />
    </button>
  );
}

/** A labelled row inside a settings card. */
function Row({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        {desc && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{desc}</div>}
      </div>
      {right}
    </div>
  );
}

function SectionTitle({ eyebrow, title, link }: { eyebrow?: string; title: string; link?: { to: string; label: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      {link && <Link to={link.to} style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{link.label} →</Link>}
    </div>
  );
}

/** Friendly device label from a stored user-agent string. */
function labelUA(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return `${os} · ${browser}`;
}
function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.round(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Real, backend-driven "signed-in devices" manager. */
function DevicesCard() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => authApi.sessions().then(setSessions).catch(() => setSessions([]));
  useEffect(() => { void load(); }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } catch { /* leave list as-is */ } finally { setBusy(false); }
  };

  const others = (sessions ?? []).filter((s) => !s.current).length;

  return (
    <Card style={{ marginTop: 18 }}>
      <SectionTitle eyebrow="Devices" title="Where you're signed in" />
      {sessions === null && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Loading your sessions…</p>}
      {sessions?.length === 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>No other active sessions.</p>}
      {(sessions ?? []).map((s) => (
        <Row key={s.id}
          title={labelUA(s.device)}
          desc={`${s.current ? 'This device · ' : ''}Active ${timeAgo(s.lastUsedAt)}${s.ip ? ` · ${s.ip}` : ''}`}
          right={s.current
            ? <span className="tag" style={{ background: 'var(--accent)', color: '#fff' }}>Current</span>
            : <Button size="sm" variant="line" disabled={busy} onClick={() => void act(() => authApi.revokeSession(s.id))}>Log out</Button>}
        />
      ))}
      {others > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button size="sm" variant="line" disabled={busy} onClick={() => void act(authApi.logoutOthers)}>Log out of all other devices</Button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        You stay signed in on each device until you log out here, change your password, or a session expires.
      </p>
    </Card>
  );
}

export function Settings() {
  const { user, signOut } = useAuth();
  const push = useWebPush();

  // On-device notification preferences (cosmetic client prefs; the message
  // push toggle below is the one wired to the server subscription).
  const [digest, setDigest] = useState(true);
  const [quiet, setQuiet] = useState(true);
  const [priceDrop, setPriceDrop] = useState(true);
  const [socialMute, setSocialMute] = useState(false);

  const [confirmText, setConfirmText] = useState('');
  const [deleteNote, setDeleteNote] = useState(false);
  const pushOn = push.permission === 'granted';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '36px 20px 90px' }}>
      <div className="eyebrow">Together City</div>
      <h1 style={{ marginBottom: 4 }}>Settings</h1>
      <p className="lede" style={{ marginTop: 0 }}>One neutral chassis for everything that governs how the city behaves for you.</p>

      {/* Privacy */}
      <Card style={{ marginTop: 22 }}>
        <SectionTitle eyebrow="Privacy" title="Which hubs may read your Medical data" link={{ to: '/medical/records', label: 'Medical Records' }} />
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 4px' }}>
          Sharing is consent-scoped. Grant or revoke each connection from your <Link to="/medical/consent" style={{ color: 'var(--accent)' }}>consent centre</Link>.
        </p>
        <Row title="Nutrition" desc="Blood reports adjust meal plans & supplement dosage" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
        <Row title="Family" desc="Share conditions with linked family TC-IDs" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
        <Row title="Beauty Market" desc="Skin conditions inform personalised beauty recommendations" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
        <Row title="Social Life" desc="Only consent-scoped shares (e.g. sharing a blood report)" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
      </Card>

      {/* Notifications */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle eyebrow="Notifications" title="How the city reaches you" link={{ to: '/profile', label: 'Notifications Centre' }} />
        {push.supported && (
          <Row
            title="Message push"
            desc={pushOn ? 'On — new messages reach you even with the app closed.'
              : push.permission === 'denied' ? 'Blocked in your browser — allow notifications for this site to enable.'
              : 'Get notified of new messages even when Together City is closed.'}
            right={pushOn ? <span className="tag">Enabled</span>
              : push.permission === 'denied' ? <span className="tag">Blocked</span>
              : <Button size="sm" variant="accent" disabled={push.busy} onClick={push.enable}>{push.busy ? 'Enabling…' : 'Enable'}</Button>}
          />
        )}
        <Row title="Digest bundling" desc="Group order updates into one notification" right={<Switch on={digest} onChange={setDigest} />} />
        <Row title="Quiet hours" desc="10:00 PM – 7:00 AM · nothing but emergencies" right={<Switch on={quiet} onChange={setQuiet} />} />
        <Row title="Price-drop alerts" desc="Saved flights & hotels" right={<Switch on={priceDrop} onChange={setPriceDrop} />} />
        <Row title="Social — likes & comments" desc="Mute individual notifications, keep digests" right={<Switch on={socialMute} onChange={setSocialMute} />} />
      </Card>

      {/* Devices — real, backend-driven session manager */}
      <DevicesCard />

      {/* Subscription & account */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle eyebrow="Subscription" title="Together+ & account" />
        <Row title="Together+" desc="Priority bookings, no-fee splits, curated perks" right={<span className="tag">Free member</span>} />
        <Row title="Export data" desc="Full archive of your city, downloadable anytime" right={<Link to="/profile" className="tag">Request</Link>} />
        <Row title="Security & 2FA" desc="Password, biometrics, two-factor" right={<span className="tag">Coming soon</span>} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Account</div>
            <div className="muted" style={{ fontSize: 12.5 }}>@{user?.handle ?? '—'}{user?.name ? ` · ${user.name}` : ''}</div>
          </div>
          <Button size="sm" variant="line" onClick={signOut}>Sign out</Button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card style={{ marginTop: 18, borderColor: 'rgba(224,52,43,.4)' }}>
        <SectionTitle title="Delete account" />
        <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          This permanently removes your Together City identity and all hub data. To continue, type <strong>DELETE</strong> below.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            style={{ flex: 1, minWidth: 200, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14 }}
          />
          <Button size="sm" variant="line" disabled={confirmText !== 'DELETE'}
            style={confirmText === 'DELETE' ? { borderColor: '#e0342b', color: '#e0342b' } : undefined}
            onClick={() => setDeleteNote(true)}>
            Delete my account
          </Button>
        </div>
        {deleteNote && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10, color: '#e0342b' }}>
            To protect against mistakes, deletion is finalised by support — email connect@togethercity.tech from your account and we'll erase everything within 24 hours.
          </p>
        )}
      </Card>
    </div>
  );
}

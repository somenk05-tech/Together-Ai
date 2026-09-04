import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWebPush } from '@/hooks/useWebPush';
import { Card, Button } from '@/components/ui';
import { authApi, type SessionInfo } from '@/api/auth.api';
import { http } from '@/api/client';
import { useMyProfile } from '@/features/social/myProfile.api';
import { DeleteAccountCard } from '../components/DeleteAccountCard';
import { ChangePasswordCard } from '../components/ChangePasswordCard';
import { SkinPicker } from '../components/SkinPicker';


/** A labelled row inside a settings card. */
function Row({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: '1px solid var(--line)' }}>
      <div className="flex-min">
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
      {link && <Link to={link.to} style={{ fontSize: 13, color: 'var(--accent-ink)', fontWeight: 600 }}>{link.label} →</Link>}
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
            ? <span className="tag" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>Current</span>
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
  // Whether to offer the moderation queue. The role is computed server-side on
  // every read of this profile rather than carried in the token, so revoking it
  // takes effect on the next request instead of on the next sign-in.
  const me = useMyProfile();

  const [exporting, setExporting] = useState(false);
  // GET /privacy/export has existed server-side since the purge work — the
  // legal pages promise "Download My Data" and this button finally keeps it.
  const downloadData = async () => {
    setExporting(true);
    try {
      const { data } = await http.get<unknown>('/privacy/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'together-city-data.json'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Couldn't build your export just now — nothing was lost. Please try again in a moment.");
    } finally {
      setExporting(false);
    }
  };

  /* "ENABLED" MEANT "YOU ALLOWED THE PROMPT" (3 Sep).
     `permission === 'granted'` is the browser's answer to a question about a
     dialog. It says nothing about whether a subscription exists, and `enable()`
     threw away the one value that knew: deploy without VAPID_PUBLIC_KEY and a
     citizen pressed Enable, allowed the prompt, and was told "On — new messages
     reach you even with the app closed" while nothing had been registered and
     nothing ever would arrive. Both halves are required now, and the states
     between them each say which problem it is and whose it is to fix. */
  const pushOn = push.permission === 'granted' && push.state === 'on';
  const pushChecking = push.permission === 'granted' && push.state === 'unknown';

  return (
    <div className="page">
      <div className="eyebrow">Together City</div>
      <h1 style={{ marginBottom: 4 }}>Settings</h1>

      {/* Privacy */}
      <Card style={{ marginTop: 22 }}>
        <SectionTitle eyebrow="Privacy" title="Which hubs may read your Medical data" link={{ to: '/medical/records', label: 'Medical Records' }} />
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 4px' }}>
          Sharing is consent-scoped. Grant or revoke each connection from your <Link to="/medical/consent" style={{ color: 'var(--accent-ink)' }}>consent centre</Link>.
        </p>
        <Row title="Nutrition" desc="Blood reports adjust meal plans & supplement dosage" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
        <Row title="Family" desc="Share conditions with linked family TC-IDs" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
        <Row title="Beauty" desc="Skin conditions inform personalised beauty recommendations" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
        <Row title="Social Life" desc="Only consent-scoped shares (e.g. sharing a blood report)" right={<Link to="/medical/consent" className="tag">Manage</Link>} />
      </Card>

      {/* Appearance. TWO CONTROLS AND NOT ONE, at the owner's word: the inbox
          and the chat room are read in different postures and at different
          hours, and somebody who wants a dark inbox at night does not
          necessarily want their conversations to move with it. One control
          would be a smaller settings page and a worse answer. */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle eyebrow="Appearance" title="The colour of your two rooms" />
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 4px' }}>
          Repaint Mail and Chat. Remembered per device — your phone and laptop can differ.
        </p>
        <SkinPicker hub="mail" label="Mail" hint="Your inbox, drafts, sent and trash." />
        <SkinPicker hub="chat" label="Chat" hint="Every conversation, and Mira." />
      </Card>

      {/* Notifications */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle eyebrow="Notifications" title="How the city reaches you" link={{ to: '/profile', label: 'Notifications Centre' }} />
        {push.supported ? (
          <Row
            title="Message push"
            desc={pushOn ? 'On — new messages reach you even with the app closed.'
              : push.permission === 'denied' ? 'Blocked in your browser — allow notifications for this site to enable.'
              : push.state === 'unconfigured' ? 'Not switched on for the city yet — there is no push key on the server, so nothing can be delivered to any browser. Nothing to fix at your end.'
              : pushChecking ? 'Checking whether this browser is registered…'
              : push.permission === 'granted' ? 'You allowed notifications, but this browser could not be registered — so nothing will arrive yet. Try again.'
              : 'Get notified of new messages even when Together City is closed.'}
            right={pushOn ? <span className="tag">Enabled</span>
              : push.permission === 'denied' ? <span className="tag">Blocked</span>
              : push.state === 'unconfigured' ? <span className="tag">Unavailable</span>
              : pushChecking ? <span className="tag">Checking…</span>
              : <Button size="sm" variant="accent" disabled={push.busy} onClick={() => void push.enable()}>{push.busy ? 'Enabling…' : push.permission === 'granted' ? 'Try again' : 'Enable'}</Button>}
          />
        ) : (
          /* THE ROW USED TO VANISH, WHICH READS AS "THERE IS NOTHING TO SAY"
             (3 Sep). The shipped native apps are a Capacitor web view, which
             exposes no Push API — so `supported` is false and the whole card
             disappeared, leaving a citizen to conclude the city simply does not
             send notifications. It does; it cannot reach them HERE. Saying so
             is the difference between a missing feature and a broken one, and
             it points at the surface that does work today. */
          <Row
            title="Message push"
            desc="Not available in this app — it has no way to receive notifications, and there is no native delivery yet. Open Together City in your phone's browser to be reached with the app closed."
            right={<span className="tag">Not available here</span>}
          />
        )}
        {/* Four switches used to sit here — digest bundling, quiet hours,
            price-drop alerts, a social mute — wired to nothing but useState.
            A control that only remembers being touched is an invented feature;
            the golden rule applies to switches too. */}
        <Row title="Muting a conversation" desc="Lives in each chat's own menu — it silences that thread everywhere, including here." right={<span className="tag">In chat</span>} />
      </Card>

      {/* Devices — real, backend-driven session manager */}
      <DevicesCard />

      {/* The password, changed while signed in (4 Sep) */}
      <ChangePasswordCard />

      {/* Safety */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle eyebrow="Safety" title="People you have blocked" />
        <Row
          title="Blocked citizens"
          desc="Blocking hides someone and stops them reaching you. This is where you undo it."
          right={<Link to="/settings/blocked" className="tag">Manage</Link>}
        />
        {/* Offered only to moderators. The server decides — this row hides the
            door, it does not lock it; every endpoint behind it checks the role
            again for itself. */}
        {me.data?.isModerator && (
          <Row
            title="Reported"
            desc="Reports filed by citizens, grouped by what they are about."
            right={<Link to="/moderation" className="tag">Open queue</Link>}
          />
        )}
      </Card>

      {/* Subscription & account */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle eyebrow="Subscription" title="Together+ & account" />
        <Row title="Together+" desc="Priority bookings, no-fee splits, curated perks" right={<span className="tag">Free member</span>} />
        <Row title="Your drive" desc="Private cloud storage for your documents and media" right={<Link to="/drive" className="tag">Open</Link>} />
        <Row title="Export data" desc="Everything the city holds about you, as one JSON file"
          right={<button type="button" className="tag" disabled={exporting} onClick={() => void downloadData()}
            style={{ cursor: exporting ? 'wait' : 'pointer', fontFamily: 'inherit', border: 'none' }}>{exporting ? 'Building…' : 'Download'}</button>} />
        <Row title="Two-factor sign-in" desc="Biometrics and a second factor" right={<span className="tag">Not yet open</span>} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Account</div>
            <div className="muted" style={{ fontSize: 12.5 }}>@{user?.handle ?? '—'}{user?.name ? ` · ${user.name}` : ''}</div>
          </div>
          <Button size="sm" variant="line" onClick={signOut}>Sign out</Button>
        </div>
      </Card>

      {/* Danger zone — shared with the Profile page's Delete account tab. */}
      <DeleteAccountCard />
    </div>
  );
}

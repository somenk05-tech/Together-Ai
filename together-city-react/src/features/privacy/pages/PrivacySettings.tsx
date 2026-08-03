import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Icon } from '@/components/ui/Icon';
import { usePrivacyStore } from '../store';
import { hydratePrivacy, pushPref } from '../api';
import { PERMISSIONS, SENSITIVE_HUBS } from '../consent.config';

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={`${label}: ${on ? 'on' : 'off'}`}
      style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--line)', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--card)', transition: 'left .15s' }} />
    </button>
  );
}

/**
 * Privacy & Permissions — granular, opt-in control over optional features
 * (audit 2.2), plus a record of the sensitive-hub consents you've acknowledged.
 * Everything here is per-permission, not one blanket switch.
 */
export function PrivacySettings() {
  const prefs = usePrivacyStore((s) => s.prefs);
  const acks = usePrivacyStore((s) => s.acks);
  const tos = usePrivacyStore((s) => s.tosAccepted);
  const setPref = usePrivacyStore((s) => s.setPref);

  useEffect(() => { void hydratePrivacy(); }, []);

  const toggle = (key: string) => {
    const next = !prefs[key];
    setPref(key, next);
    pushPref(key, next);
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 56px' }}>
      <Breadcrumbs />
      <div className="eyebrow" style={{ marginTop: 10 }}>Settings</div>
      <h1 style={{ fontSize: 26 }}>Privacy &amp; Permissions</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 22px', lineHeight: 1.6 }}>
        You choose what Together City can use, feature by feature. Nothing here is required to have an
        account — turn anything off and it takes effect immediately.
      </p>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Optional features</h2>
      {PERMISSIONS.map((p) => (
        <div key={p.key} className="card" style={{ marginBottom: 10, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.label}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}>{p.desc}</div>
          </div>
          <Toggle on={Boolean(prefs[p.key])} onClick={() => toggle(p.key)} label={p.label} />
        </div>
      ))}

      <h2 style={{ fontSize: 16, margin: '26px 0 10px' }}>Sensitive hubs</h2>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.55 }}>
        Each of these shows a short privacy explainer the first time you enter. Here's the promise for each and whether you've reviewed it.
      </p>
      {Object.values(SENSITIVE_HUBS).map((h) => (
        <div key={h.hub} className="card" style={{ marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name={h.icon} size={17} style={{ color: 'var(--accent-ink)' }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{h.label}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.55 }}>{h.promise}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: acks[h.hub] ? 'var(--ok-ink)' : 'var(--muted)', flexShrink: 0, marginTop: 3 }}>
            {acks[h.hub] ? '● Reviewed' : '○ Not yet'}
          </span>
        </div>
      ))}

      <p className="muted" style={{ fontSize: 12, marginTop: 22 }}>
        Read the full <Link to="/legal/privacy" style={{ color: 'var(--accent-ink)' }}>Privacy Policy</Link> and{' '}
        <Link to="/legal/terms" style={{ color: 'var(--accent-ink)' }}>Terms of Service</Link>.
        {tos ? ' You accepted these when you joined.' : ''}
      </p>
    </div>
  );
}

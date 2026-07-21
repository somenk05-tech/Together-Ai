import { useEffect, useState } from 'react';
import { authApi } from '@/api/auth.api';
import { API_BASE } from '@/api/client';

const PROVIDERS = [
  { key: 'google', label: 'Continue with Google', icon: '🔵' },
  { key: 'apple', label: 'Continue with Apple', icon: '' },
  { key: 'microsoft', label: 'Continue with Microsoft', icon: '🪟' },
];

const base: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', textDecoration: 'none' };

/** Social sign-in row. Enabled providers link straight to the backend OAuth
 *  start URL (full-page redirect); the rest show a "soon" state. */
export function SocialButtons() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  useEffect(() => { authApi.oauthProviders().then(setEnabled).catch(() => setEnabled({})); }, []);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 14px' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span className="muted" style={{ fontSize: 11, letterSpacing: '.1em' }}>OR</span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PROVIDERS.map((p) => enabled[p.key] ? (
          <a key={p.key} href={`${API_BASE}/auth/oauth/${p.key}`} className="tc-field"
            style={{ ...base, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', cursor: 'pointer' }}>
            <span style={{ fontSize: 15 }}>{p.icon}</span> {p.label}
          </a>
        ) : (
          <button key={p.key} type="button" disabled title="Coming soon"
            style={{ ...base, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: 'not-allowed', opacity: 0.7 }}>
            <span style={{ fontSize: 15 }}>{p.icon}</span> {p.label}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px dashed var(--line)', borderRadius: 999, padding: '1px 7px' }}>soon</span>
          </button>
        ))}
      </div>
    </>
  );
}

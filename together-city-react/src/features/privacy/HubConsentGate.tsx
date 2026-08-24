import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacyStore } from './store';
import { consentFor } from './consent.config';
import { pushAck, hydratePrivacy } from './api';
import { Icon } from '@/components/ui/Icon';
import { Button, Spinner } from '@/components/ui';

/**
 * Shows a short, plain-language consent screen the first time a user enters a
 * sensitive hub (Medical, Dating, Financial, Family, Astrology) — what data, why,
 * who can see it, and how to control it (audit 2.2). Once acknowledged it never
 * shows again — for the USER, not just the device: before showing the gate we
 * pull the account's server-side consent record, so a consent given on any
 * device/session is respected everywhere. Non-sensitive hubs pass straight through.
 */
export function HubConsentGate({ hub, children }: { hub?: string; children: ReactNode }) {
  const cfg = consentFor(hub);
  const nav = useNavigate();
  const acked = usePrivacyStore((s) => (hub ? s.acks[hub] : true));
  const hydrated = usePrivacyStore((s) => s.hydrated);
  const ackHub = usePrivacyStore((s) => s.ackHub);

  // Only reach for the server record when we might actually show the gate
  // (not acknowledged on this device yet). If the account already consented
  // elsewhere, hydration flips `acked` true and the gate never appears.
  useEffect(() => {
    if (cfg && !acked && !hydrated) void hydratePrivacy();
  }, [cfg, acked, hydrated]);

  if (!cfg || acked) return <>{children}</>;
  // Not acknowledged locally — wait for the account's record before deciding,
  // so an already-consented user never sees this a second time.
  if (!hydrated) return <div style={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}><Spinner label="One moment…" /></div>;

  const rows: { label: string; body: string }[] = [
    { label: 'What we use', body: cfg.what },
    { label: 'Why', body: cfg.why },
    { label: 'Who can see it', body: cfg.who },
    { label: 'Your control', body: cfg.control },
  ];

  const accept = () => { if (hub) { ackHub(hub); pushAck(hub); } };

  return (
    <div className="page-note">
      <div className="card rise" style={{ padding: '30px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name={cfg.icon} size={22} style={{ color: 'var(--accent-ink)' }} />
          </span>
          <div>
            <div className="eyebrow">{cfg.label} · Your privacy</div>
            <h1 style={{ fontSize: 20, lineHeight: 1.25 }}>Before you continue</h1>
          </div>
        </div>

        <p style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 18 }}>{cfg.promise}</p>

        <div style={{ borderTop: '1px solid var(--line)' }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <Icon name="accepted" size={16} style={{ color: 'var(--accent-ink)', marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}</div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 2 }}>{r.body}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 11.5, margin: '14px 0 18px' }}>
          You can change or withdraw this any time in Settings → Privacy &amp; Permissions.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="accent" style={{ flex: 1, justifyContent: 'center' }} onClick={accept}>Continue</Button>
          <Button variant="ghost" style={{ justifyContent: 'center' }} onClick={() => nav(-1)}>Not now</Button>
        </div>
      </div>
    </div>
  );
}

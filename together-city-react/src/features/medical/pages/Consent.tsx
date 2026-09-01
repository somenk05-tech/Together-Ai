import { Spinner, EmptyState } from '@/components/ui';
import { useConsents, useSetConsent } from '../api';

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      style={{
        width: 46, height: 26, borderRadius: 'var(--r-full)', border: 'none', cursor: disabled ? 'wait' : 'pointer',
        background: on ? 'var(--accent)' : 'var(--line)', position: 'relative', transition: 'background .15s', flexShrink: 0,
      }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--card)', transition: 'left .15s' }} />
    </button>
  );
}

/** Privacy & Consent — the consent core. Toggling actually gates biomarker sharing. */
export function Consent() {
  const consents = useConsents();
  const set = useSetConsent();

  if (consents.isLoading) return <Spinner label="Loading your privacy settings…" />;
  if (consents.isError || !consents.data) return <EmptyState title="Couldn't load consent settings" hint="Nothing has been granted or revoked. We couldn’t read your settings, so we’re not showing you switches that might be wrong." />;

  return (
    <div>
      <div className="eyebrow">Medical Hub · Privacy & Consent</div>
      <h1 style={{ fontSize: 26 }}>Who can read your health data</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        The Medical Hub is your source of truth. Other hubs can read your biomarkers only while you
        allow it — turn a hub off and it immediately loses access.
      </p>

      {consents.data.map((c) => (
        <div key={c.hub} className="card" style={{ marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="flex-min">
            <div style={{ fontWeight: 700, fontSize: 15 }}>{c.label}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{c.reads}</div>
            <div style={{ fontSize: 11.5, marginTop: 4, color: c.granted ? 'var(--ok-ink)' : 'var(--danger-ink)', fontWeight: 600 }}>
              {c.granted ? '● Can read your biomarkers' : '○ Access revoked'}
            </div>
          </div>
          <Toggle on={c.granted} disabled={set.isPending} onClick={() => set.mutate({ hub: c.hub, granted: !c.granted })} />
        </div>
      ))}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
        🔒 Enforced server-side — a hub without permission is refused, not just hidden.
      </p>
    </div>
  );
}

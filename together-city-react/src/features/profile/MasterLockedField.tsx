import { Link } from 'react-router-dom';

/**
 * A small note shown under a field that is owned by the Master Profile (name,
 * age…). Once set there, the field is read-only in every hub — it can only be
 * changed in the Master Profile, so shared info is never entered twice.
 */
export function MasterLockedNote({ label = 'This' }: { label?: string }) {
  return (
    <p className="muted" style={{ fontSize: 11, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
      🔒 {label} is set in your{' '}
      <Link to="/profile/astrology" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Master Profile</Link>.
    </p>
  );
}

/** Shared visual style for a disabled, master-owned input. */
export const masterLockedStyle: React.CSSProperties = {
  background: 'var(--paper)', color: 'var(--muted)', cursor: 'not-allowed', opacity: 0.85,
};

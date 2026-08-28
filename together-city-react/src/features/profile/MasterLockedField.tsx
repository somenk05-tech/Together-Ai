import { Link } from 'react-router-dom';

/**
 * A small note shown under a field that is owned by the Master Profile (name,
 * age…). Once set there, the field is read-only in every hub — it can only be
 * changed in the Master Profile, so shared info is never entered twice.
 *
 * THE LINK SAID ONE PLACE AND WENT TO ANOTHER. (28 Aug.) It read "set in your
 * Master Profile" and pointed at /profile/astrology — the birth-details form,
 * which shares one field with the record and owns none of the others. A
 * citizen who followed it to change a locked age arrived at a horoscope form
 * that could not change it. It goes to the Identity section of the Master
 * Profile now, which is where every field this note appears under is written.
 */
export function MasterLockedNote({ label = 'This' }: { label?: string }) {
  return (
    <p className="muted" style={{ fontSize: 11, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
      🔒 {label} is set in your{' '}
      <Link to="/profile#identity" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Master Profile</Link>.
    </p>
  );
}

/** Shared visual style for a disabled, master-owned input. */
export const masterLockedStyle: React.CSSProperties = {
  background: 'var(--paper)', color: 'var(--muted)', cursor: 'not-allowed', opacity: 0.85,
};

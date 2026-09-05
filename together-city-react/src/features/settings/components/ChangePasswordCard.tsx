import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';

/**
 * ── CHANGE PASSWORD, SIGNED IN (launch gate, third reading, 4 Sep) ──────────
 *
 * Settings said "Security & 2FA — Coming soon" and the devices card said you
 * stay signed in "until you change your password", and there was no page to
 * do it on. A citizen who thought their password had leaked had to sign out
 * and go through the forgot-code flow, which needs an email to arrive.
 *
 * The server verifies the current password, applies the sign-up policy to
 * the new one, signs out EVERY session — this one included — and hands back
 * a fresh pair for this device, which is stored here so the person who
 * pressed the button never sees a sign-in screen. Everybody else does.
 *
 * Classes only, no inline style objects: the size ratchet counts them and a
 * form is not a reason to raise it.
 */
export function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mismatch = again.length > 0 && next !== again;
  const ready = current.length > 0 && next.length >= 12 && next === again && !busy;

  const submit = async () => {
    setBusy(true); setError(null); setDone(false);
    try {
      const { accessToken, refreshToken } = await authApi.changePassword({ currentPassword: current, newPassword: next });
      // The old pair is revoked server-side; this device continues on the new one.
      useAuthStore.setState({ tokens: { accessToken, refreshToken } });
      setCurrent(''); setNext(''); setAgain('');
      setDone(true);
    } catch (err) {
      const raw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(raw) ? raw.join(', ') : raw ?? 'The password could not be changed just now — nothing has changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rows">
      <div>
        <div className="eyebrow">Security</div>
        <h3>Change your password</h3>
        <p className="muted">
          At least 12 characters, and not a common word with numbers on the end. Changing it signs
          out every other device at once; this one stays signed in.
        </p>
      </div>
      <form className="rows" onSubmit={(e) => { e.preventDefault(); if (ready) void submit(); }}>
        <input type="password" value={current} autoComplete="current-password" aria-label="Current password"
          placeholder="Current password" onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" value={next} autoComplete="new-password" aria-label="New password"
          placeholder="New password" minLength={12} onChange={(e) => setNext(e.target.value)} />
        <input type="password" value={again} autoComplete="new-password" aria-label="New password, again"
          aria-invalid={mismatch || undefined} placeholder="New password, again" onChange={(e) => setAgain(e.target.value)} />
        <div className="pill-row">
          <Button type="submit" size="sm" variant="accent" disabled={!ready}>{busy ? 'Changing…' : 'Change password'}</Button>
          {mismatch && <span className="muted">The two new passwords differ.</span>}
        </div>
        {error && <p className="muted" role="alert">{error}</p>}
        {done && <p className="muted" role="status">Changed. Every other device has been signed out, and a note is on its way to your inbox.</p>}
      </form>
    </Card>
  );
}

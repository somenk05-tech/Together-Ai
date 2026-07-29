import { useState } from 'react';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';

const DISMISS_KEY = 'tc:verify-banner-dismissed';

/**
 * Soft-gate banner: the app stays usable while an email is unconfirmed, but a
 * few public-facing actions (posting to the city feed, listing a property,
 * connecting in dating) are blocked server-side by VerifiedGuard. This tells
 * the user why, and lets them re-send the link without leaving the page.
 *
 * Hidden when: signed out, no email on file (phone-only accounts have nothing
 * to confirm), already verified, or dismissed for this session.
 */
export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  const needsVerify = Boolean(user?.email) && user?.emailVerified === false;
  if (!needsVerify || hidden) return null;

  const resend = async () => {
    setState('sending');
    try { await authApi.sendVerification(); setState('sent'); }
    catch { setState('error'); }
  };

  const dismiss = () => {
    setHidden(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 18px', fontSize: 13.5,
      background: 'color-mix(in srgb, var(--gold) 14%, var(--paper))',
      borderBottom: '1px solid color-mix(in srgb, var(--gold) 34%, var(--line))',
      color: 'var(--ink)',
    }}>
      <span aria-hidden style={{ fontSize: 15 }}>✉️</span>
      <span style={{ flex: 1, minWidth: 220 }}>
        {state === 'sent'
          ? <>Verification link sent to <strong>{user?.email}</strong>. Open it to confirm your address.</>
          : state === 'error'
            ? <>Couldn't send the verification email just now — please try again in a moment.</>
            : <>Confirm your email{user?.email ? <> (<strong>{user.email}</strong>)</> : ''} to publish posts, list property and connect in Dating.</>}
      </span>
      {state !== 'sent' && (
        <button type="button" onClick={resend} disabled={state === 'sending'}
          style={{
            cursor: state === 'sending' ? 'default' : 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
            padding: '7px 14px', borderRadius: 999, border: 'none',
            background: 'var(--gold)', color: '#fff', opacity: state === 'sending' ? 0.7 : 1,
          }}>
          {state === 'sending' ? 'Sending…' : 'Resend link'}
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--muted)', padding: '0 2px' }}>
        ×
      </button>
    </div>
  );
}

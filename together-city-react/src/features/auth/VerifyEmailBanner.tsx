import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

const DISMISS_KEY = 'tc:verify-banner-dismissed';

/**
 * The one place an unconfirmed address is raised, now that nothing blocks on it.
 *
 * This used to explain a soft gate: "a few public-facing actions (posting to the
 * city feed, listing a property, connecting in dating) are blocked server-side by
 * VerifiedGuard". Those guards are gone — verification is a sign-up-time step and
 * the guards were the retired link flow's enforcement, ambushing people days
 * later on an ordinary action. Leaving this copy up would have made the banner
 * threaten consequences the server no longer applies, which is the same species
 * of untrue sentence the guards themselves were.
 *
 * So it now says the reason that is actually true: an unconfirmed address cannot
 * be used to get back into the account. That is not a threat, it is the thing
 * they will wish they had done, and it is worth saying every session until it is
 * done — which is what a banner is for.
 *
 * It used to carry a "Resend link" button that mailed a 24-hour verification
 * link. That flow is gone — the link was filed in the citizen's own in-app
 * inbox, so it could be clicked by anyone holding a session, without ever
 * having access to the mailbox it was addressed to. Verification that can be
 * completed without reading the email verifies nothing.
 *
 * So the banner now points at the six-digit flow on the profile instead of
 * doing anything itself. A banner that starts a process it cannot finish — send
 * a link, then leave the person to go and find it — was always the weaker half
 * of this anyway.
 *
 * Hidden when: signed out, no email on file (phone-only accounts have nothing
 * to confirm), already verified, or dismissed for this session.
 */
export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  const needsVerify = Boolean(user?.email) && user?.emailVerified === false;
  if (!needsVerify || hidden) return null;

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
        Confirm your email{user?.email ? <> (<strong>{user.email}</strong>)</> : ''} so you can get back
        in if you forget your password. Nothing is locked until you do.
      </span>
      <Link
        to="/profile"
        style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
          padding: '7px 14px', borderRadius: 999, textDecoration: 'none',
          background: 'var(--gold)', color: 'var(--on-accent)',
        }}
      >
        Verify now
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--muted)', padding: '0 2px' }}>
        ×
      </button>
    </div>
  );
}

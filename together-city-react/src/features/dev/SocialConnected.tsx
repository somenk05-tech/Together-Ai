import { useEffect, useState } from 'react';
import { SIGNIN_MESSAGE, type SignInMessage } from './media.api';

/**
 * ── WHERE A PLATFORM SENDS THE CONNECT POP-UP BACK ──────────────────────────
 *
 * Google, Instagram and Threads redirect here with `?code=…&state=…`. This
 * page does nothing with them itself: it hands them to the desk that opened
 * it — same origin only — and closes. The desk holds the developer password
 * and sends the code on to the API, so the API never needs a public route for
 * a sign-in to land on.
 */
export function SocialConnected() {
  const [said, setSaid] = useState('Finishing the sign-in…');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const msg: SignInMessage = {
      type: SIGNIN_MESSAGE,
      code: q.get('code'),
      state: q.get('state'),
      error: q.get('error_description') ?? q.get('error_message') ?? q.get('error'),
    };
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) {
      setSaid('The desk that opened this window is gone. Close this window and press Connect again.');
      return;
    }
    opener.postMessage(msg, window.location.origin);
    setSaid(msg.error ? `The platform said: ${msg.error}` : 'Signed in. You can close this window.');
    window.close();
  }, []);
  return (
    <div className="page-note">
      <p className="md-note">{said}</p>
    </div>
  );
}

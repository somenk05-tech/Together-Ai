/**
 * Cloudflare Turnstile, the whole client half. (26 Aug.)
 *
 * With VITE_TURNSTILE_SITE_KEY unset this module does nothing and `getToken`
 * resolves undefined — development and every existing test run exactly as
 * before. With it set, the script is loaded once, an invisible widget is
 * rendered into a hidden container, and `getToken` resolves the token the
 * API expects in `turnstileToken`. The server decides whether to require it
 * (TURNSTILE_SECRET); this side only ever offers it.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(el: HTMLElement, opts: { sitekey: string; action?: string; size?: string; callback(token: string): void; 'error-callback'?(): void; 'expired-callback'?(): void }): string;
  reset(id: string): void;
  remove(id: string): void;
}

export const turnstileEnabled = Boolean(SITE_KEY);

/** The doors Turnstile guards. Must match the action the API asserts. */
export type TurnstileAction = 'register' | 'login';

let loading: Promise<TurnstileApi> | null = null;
function load(): Promise<TurnstileApi> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const w = window as unknown as { turnstile?: TurnstileApi };
    if (w.turnstile) { resolve(w.turnstile); return; }
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile did not load')));
    s.onerror = () => reject(new Error('turnstile did not load'));
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * One fresh token, or undefined when Turnstile is off. A token is single-use
 * and short-lived, so this renders a new widget per call and removes it
 * after — a form that is submitted twice gets two tokens.
 *
 * `action` names the door this token is for and comes back in the server's
 * siteverify response, where it is compared against the surface that was
 * actually called. Both halves ship together: a widget rendered without an
 * action reports none, and the server refuses none. (28 Aug.)
 */
export async function getTurnstileToken(action: TurnstileAction): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const api = await load();
  const host = document.createElement('div');
  host.style.position = 'fixed'; host.style.bottom = '0'; host.style.right = '0'; host.style.zIndex = '2147483647';
  document.body.appendChild(host);
  return new Promise<string | undefined>((resolve) => {
    let id = '';
    let settled = false;
    /**
     * A CHALLENGE NOBODY ANSWERS MUST NOT BE A BUTTON THAT NEVER RETURNS.
     *
     * Cloudflare settles this promise through `callback`, `error-callback` or
     * `expired-callback`, and there are ordinary ways for none of the three to
     * fire: an interactive challenge the visitor never notices (this widget
     * renders into a corner), a script an extension or a strict network blocks
     * after it has been appended, a tab backgrounded mid-verify. Without a
     * clock the sign-in button then spins for as long as the visitor is
     * willing to watch it, and nothing anywhere says why.
     *
     * Resolving undefined is not a bypass: the server refuses a missing token
     * whenever a secret is configured, so the visitor gets "Complete the are
     * you human check and try again" — a sentence they can act on — instead of
     * a spinner they cannot. (28 Aug.)
     */
    const done = (token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(clock);
      try { api.remove(id); } catch { /* gone */ } host.remove(); resolve(token);
    };
    const clock = setTimeout(() => done(undefined), 15000);
    id = api.render(host, {
      sitekey: SITE_KEY,
      action,
      size: 'normal',
      callback: (token) => done(token),
      'error-callback': () => done(undefined),
      'expired-callback': () => done(undefined),
    });
  });
}

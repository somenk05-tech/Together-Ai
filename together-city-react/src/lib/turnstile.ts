/**
 * Cloudflare Turnstile, the whole client half. (26 Aug.)
 *
 * With VITE_TURNSTILE_SITE_KEY unset this module does nothing and `getToken`
 * resolves undefined — development and every existing test run exactly as
 * before. With it set, the script is loaded once, a widget is rendered into a
 * container, and `getToken` resolves the token the API expects in
 * `turnstileToken`. The server decides whether to require it
 * (TURNSTILE_SECRET); this side only ever offers it.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(el: HTMLElement, opts: { sitekey: string; action?: string; size?: string; appearance?: string; callback(token: string): void; 'error-callback'?(): void; 'expired-callback'?(): void; 'before-interactive-callback'?(): void; 'after-interactive-callback'?(): void }): string;
  reset(id: string): void;
  remove(id: string): void;
}

/**
 * `turnstileEnabled` was exported here on 26 Aug and never imported once.
 *
 * It cannot have a consumer, by this module's own design: "the server decides
 * whether to require it (TURNSTILE_SECRET); this side only ever offers it."
 * There is no client-side branch to take — with a sitekey the widget renders,
 * without one `getTurnstileToken` resolves undefined and sign-in proceeds
 * exactly as before. A flag answering a question nothing is allowed to ask is
 * an invitation to build the branch that the paragraph above forbids.
 */

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
  /**
   * A CHALLENGE THE VISITOR MUST ANSWER MUST BE ONE THEY CAN SEE. (28 Aug.)
   *
   * The first cut of this file parked the widget in a bottom corner and the
   * widget mode was Invisible, which never shows anything at all. On a phone —
   * where Cloudflare asks for interaction far more often — that meant the
   * challenge failed unseen, the clock below gave up, and every mobile
   * sign-up died at "Complete the are you human check and try again".
   *
   * Now the host is a full-screen overlay that stays hidden while Cloudflare
   * verifies silently, and is shown (with a dim backdrop and the widget
   * centered) the moment Cloudflare says interaction is coming —
   * `before-interactive-callback`. `appearance: 'interaction-only'` keeps the
   * silent path silent. The widget itself must be in MANAGED mode in the
   * Cloudflare dashboard: Invisible mode can never interact, so under it a
   * visitor Cloudflare distrusts is a visitor who cannot get in.
   */
  const host = document.createElement('div');
  host.style.position = 'fixed'; host.style.inset = '0'; host.style.zIndex = '2147483647';
  host.style.display = 'none'; host.style.alignItems = 'center'; host.style.justifyContent = 'center';
  host.style.background = 'rgba(0,0,0,0.45)';
  const box = document.createElement('div');
  box.style.background = '#fff'; box.style.borderRadius = '12px'; box.style.padding = '18px';
  box.style.boxShadow = '0 12px 40px rgba(0,0,0,0.25)'; box.style.maxWidth = '92vw';
  const note = document.createElement('p');
  note.textContent = 'Quick check that you are human';
  note.style.margin = '0 0 10px'; note.style.font = '600 13px/1.4 system-ui, sans-serif'; note.style.color = '#333';
  const slot = document.createElement('div');
  box.appendChild(note); box.appendChild(slot); host.appendChild(box);
  document.body.appendChild(host);
  return new Promise<string | undefined>((resolve) => {
    let id = '';
    let settled = false;
    /**
     * A CHALLENGE NOBODY ANSWERS MUST NOT BE A BUTTON THAT NEVER RETURNS.
     *
     * Cloudflare settles this promise through `callback`, `error-callback` or
     * `expired-callback`, and there are ordinary ways for none of the three to
     * fire: a script an extension or a strict network blocks after it has been
     * appended, a tab backgrounded mid-verify. Without a clock the sign-in
     * button then spins for as long as the visitor is willing to watch it, and
     * nothing anywhere says why.
     *
     * Resolving undefined is not a bypass: the server refuses a missing token
     * whenever a secret is configured, so the visitor gets "Complete the are
     * you human check and try again" — a sentence they can act on — instead of
     * a spinner they cannot. (28 Aug.)
     *
     * The clock is 15s while the check is silent. The moment Cloudflare says
     * a person will be asked to click, the deadline stretches to two minutes —
     * a visitor mid-challenge must not have the form give up underneath them.
     */
    const done = (token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(clock);
      try { api.remove(id); } catch { /* gone */ } host.remove(); resolve(token);
    };
    let clock = setTimeout(() => done(undefined), 15000);
    id = api.render(slot, {
      sitekey: SITE_KEY,
      action,
      size: 'normal',
      appearance: 'interaction-only',
      callback: (token) => done(token),
      'error-callback': () => done(undefined),
      'expired-callback': () => done(undefined),
      'before-interactive-callback': () => {
        clearTimeout(clock);
        clock = setTimeout(() => done(undefined), 120000);
        host.style.display = 'flex';
      },
      'after-interactive-callback': () => { host.style.display = 'none'; },
    });
  });
}

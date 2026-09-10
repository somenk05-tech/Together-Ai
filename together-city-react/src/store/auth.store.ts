import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, User } from '@/types';
import { authApi } from '@/api';
import { resetClientState } from '@/api/session-reset';
import { getTurnstileToken } from '@/lib/turnstile';

/** Read a JWT's `exp` (no verification) to tell if it's already expired, so the
 *  app can refresh or log out cleanly BEFORE firing a burst of doomed requests. */
export function isTokenExpired(token?: string | null): boolean {
  if (!token) return true;
  try {
    const payload = token.split('.')[1];
    // unknown, then narrowed: a JWT payload is attacker-adjacent input, and
    // `any` here was the exact hole the lint error pointed at.
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = typeof json === 'object' && json !== null && 'exp' in json
      ? (json as { exp: unknown }).exp : undefined;
    if (typeof exp !== 'number') return false;       // no exp claim → treat as valid
    return Date.now() >= exp * 1000 - 5000;          // 5s early margin
  } catch {
    return true; // unparseable → treat as expired
  }
}

/**
 * ── WHERE THE SIXTY-DAY TOKEN LIVES ─────────────────────────────────────────
 *
 * In localStorage, until 6 September, for every browser — readable by any
 * script on the origin. The server had always set an HttpOnly `tc_refresh`
 * cookie and gone to real trouble over it (POST /auth/refresh withholds the
 * token from the body when the cookie authenticated the call, precisely so a
 * cross-site page riding it cannot read the token out); the client simply never
 * sent the cookie, because `withCredentials` was off.
 *
 * It is on now, and this store decides per browser which of the two it is on:
 *
 *   `cookieSession: true`   the cookie works. The refresh token is NEVER
 *                           persisted and is not even held in memory — the
 *                           server has it, and `refresh()` sends nothing.
 *   `cookieSession: false`  the cookie was blocked (Safari's ITP refuses a
 *                           cross-site one). The body fallback is used and
 *                           persisted, exactly as before. Nobody is locked out
 *                           for a browser policy.
 *
 * It is PROVEN, not assumed: right after a login the store makes one
 * cookie-only refresh, and only a success flips the flag. So the token is in
 * localStorage for the width of one request on a cookie-capable browser, and
 * for the session on one that is not.
 *
 * The ACCESS token is still persisted either way. It lives fifteen minutes, and
 * dropping it would cost a refresh round trip on every reload before the app
 * could render as signed in.
 *
 * The fallback goes away entirely when the API is same-site — api.togethercity.app
 * rather than a railway.app host — at which point the cookie is first-party and
 * every browser keeps it. That is a DNS change, not a code one.
 */
interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  /** True once a cookie-only refresh has succeeded on this browser. */
  cookieSession: boolean;
  ready: boolean;
  isAuthenticated: () => boolean;
  login: (handle: string, password: string) => Promise<void>;
  register: (handle: string, name: string, password: string, contact: { email: string; phone?: string; dateOfBirth: string; gender: 'male' | 'female' | 'nonBinary' | 'other'; genderOther?: string; orientation?: 'straight' | 'gay' | 'lesbian' | 'bisexual' | 'pansexual' | 'asexual' | 'queer' | 'other' | 'preferNotToSay'; orientationOther?: string }) => Promise<void>;
  refresh: () => Promise<string | null>;
  signOut: () => void;
  hydrate: () => Promise<void>;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * One cookie-only refresh, right after a login, to find out whether this
 * browser will hold the HttpOnly cookie.
 *
 * On success the refresh token is dropped from state — and therefore from
 * localStorage, which is the whole point — and the rotated access token is
 * adopted. On failure nothing changes and the body fallback stays in force, so
 * a browser that refuses the cookie is exactly as signed in as it was.
 *
 * Awaited rather than fired and forgotten: it must settle before the first
 * persist, or a cookie-capable browser writes the token to disk for as long as
 * it takes to come back.
 */
async function proveCookie(set: (s: Partial<AuthState>) => void): Promise<void> {
  try {
    const tokens = await authApi.refresh();
    set({ tokens: { accessToken: tokens.accessToken }, cookieSession: true });
  } catch {
    // The cookie was blocked, or the server said no. Either way the tokens
    // already in state are the ones that work; leave them alone.
  }
}

/** Typed auth store over the NestJS handle+password endpoints. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      cookieSession: false,
      ready: false,
      isAuthenticated: () => Boolean(get().tokens?.accessToken && get().user),

      login: async (handle, password) => {
        // Wipe any prior user's cached/persisted state BEFORE establishing the
        // new session, so this login can't inherit the previous user's data.
        resetClientState();
        try { sessionStorage.removeItem('tc:signed-out'); } catch { /* noop */ }
        const { accessToken, refreshToken } = await authApi.login({ handle, password, turnstileToken: await getTurnstileToken('login') });
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
        await proveCookie(set);
      },

      register: async (handle, name, password, contact) => {
        resetClientState();
        try { sessionStorage.removeItem('tc:signed-out'); } catch { /* noop */ }
        const { accessToken, refreshToken } = await authApi.register({ handle, name, password, email: contact.email, phone: contact.phone || undefined, dateOfBirth: contact.dateOfBirth, gender: contact.gender, genderOther: contact.genderOther || undefined, orientation: contact.orientation, orientationOther: contact.orientationOther || undefined, turnstileToken: await getTurnstileToken('register') });
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
        await proveCookie(set);
      },


      refresh: async () => {
        // SINGLE-FLIGHT: hydrate, the 401 interceptor and any other caller share
        // one in-flight rotation. Refresh tokens are single-use server-side, so
        // two concurrent rotations meant the loser was told "invalid" and the
        // citizen was signed out of a live session mid-use.
        /* THE SLOT EMPTIES ON EVERY EXIT (10 Sep). It was emptied in exactly
           one place — the `finally` of the body-fallback `try` below — so the
           commonest path of all, a cookie refresh that SUCCEEDED, returned
           before reaching it and left a settled promise in the slot for the
           life of the tab. Fifteen minutes later the access token died, every
           401 asked for a refresh, and was handed the same dead token again:
           the retry 401'd, the page said "Couldn't load the directory", and
           only a reload (a fresh module) got it back. The outage path
           (`return null` on a 5xx) stuck the same way with null. So the
           rotation is wrapped whole, and the slot is cleared by the promise
           itself whichever way it leaves. */
        refreshInFlight ??= (async (): Promise<string | null> => {
          /* THE COOKIE FIRST, ALWAYS. It costs one request that fails fast when
             there is no cookie, and it is what keeps the refresh token out of
             localStorage on every browser that will hold one. A definitive
             "no" here is not the end of the session — it is the signal to try
             the body fallback below. An OUTAGE is neither, and returns null
             without touching the stored session, for the reason spelled out in
             the catch further down. */
          try {
            const tokens = await authApi.refresh();
            set({ tokens: { accessToken: tokens.accessToken }, cookieSession: true });
            return tokens.accessToken;
          } catch (e) {
            const status = (e as { response?: { status?: number } } | null)?.response?.status;
            if (status !== 400 && status !== 401 && status !== 403) return null;
          }
          // No cookie the server would take. Fall back to the token this
          // browser had to keep because its cookie policy left us no choice.
          const rt = get().tokens?.refreshToken;
          if (!rt) {
            set({ user: null, tokens: null });
            return null;
          }
          try {
            const tokens = await authApi.refresh(rt);
            set({ tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }, cookieSession: false });
            return tokens.accessToken;
          } catch (e) {
            // Only a definitive server "no" ends the session. A timeout, a cold
            // start, DNS failure or a 5xx is OUR outage — signing the citizen out
            // for it is the "app forgot who I am" bug. Keep the tokens; the next
            // attempt (or the error states) will tell the truth about the outage.
            const status = (e as { response?: { status?: number } } | null)?.response?.status;
            if (status === 400 || status === 401 || status === 403) {
              set({ user: null, tokens: null });
              // Same cleanup as signOut: the recent-pages trail and every other
              // per-user store must not outlive the session on a shared machine.
              resetClientState();
            }
            return null;
          }
        })().finally(() => { refreshInFlight = null; });
        return refreshInFlight;
      },

      // Only hit /auth/logout when we actually hold a live token — otherwise just
      // clear local state (avoids a storm of 401 "missing header" logout calls).
      signOut: () => {
        const t = get().tokens;
        if (t?.accessToken && !isTokenExpired(t.accessToken)) void authApi.logout().catch(() => undefined);
        // A DELIBERATE sign-out is a fresh start: the next login lands on the
        // home page, not on whatever screen happened to be open (owner, 24
        // Aug). Session EXPIRY deliberately does not set this — being sent
        // back to the page you were working on after a token dies mid-task is
        // the right behaviour there. sessionStorage, not localStorage: the
        // marker is for this browser tab's next login, not for posterity.
        try { sessionStorage.setItem('tc:signed-out', '1'); } catch { /* private mode */ }
        set({ user: null, tokens: null, cookieSession: false });
        // Drop the query cache + every per-user persisted store so the next user
        // on this browser starts clean (no inherited data). In-memory-only stores
        // are wiped by the reload the login screen triggers.
        resetClientState();
      },

      hydrate: async () => {
        const t = get().tokens;
        /* No stored access token. On a cookie session that is the NORMAL state
           after a long absence — the fifteen-minute token expired and was
           dropped, and the cookie is what restores the session — so this tries
           a refresh before deciding nobody is signed in. On a browser with no
           cookie and no stored refresh token it is one request that 401s, and
           the login screen. */
        if (!t?.accessToken) {
          const fresh = await get().refresh();
          set({ ready: true });
          if (!fresh) return;
          authApi.me().then((user) => set({ user })).catch(() => undefined);
          return;
        }
        // Stored access token already expired: refresh ONCE before rendering as
        // authenticated, so we never fire a burst of doomed protected requests.
        // If refresh fails, the session is cleared → clean login screen.
        if (isTokenExpired(t.accessToken)) {
          const fresh = await get().refresh();
          set({ ready: true });
          if (!fresh) return;
        } else {
          set({ ready: true });
        }
        // Session is live → refresh the profile in the background.
        authApi.me().then((user) => set({ user })).catch(() => undefined);
      },
    }),
    // Persist the user too, so a reload shows the app instantly instead of
    // waiting on /users/me (which is slow right after a deploy).
    /* WHAT IS WRITTEN TO localStorage, AND WHAT IS NOT.
       On a cookie session the refresh token is dropped here rather than
       persisted — the server holds it, and this browser never needs to. The
       access token stays either way: it lives fifteen minutes, and dropping it
       would cost a refresh round trip on every reload before the app could
       render as signed in. See the note above AuthState. */
    {
      name: 'tc:auth',
      partialize: (s) => ({
        tokens: s.cookieSession && s.tokens ? { accessToken: s.tokens.accessToken } : s.tokens,
        user: s.user,
        cookieSession: s.cookieSession,
      }),
    },
  ),
);

// Another tab rotated the session (refresh tokens are single-use) or signed
// out. Adopt its state instead of keeping stale tokens that would fail the
// next refresh and sign THIS tab out of a live session.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'tc:auth') return;
    try {
      const next = e.newValue
        ? (JSON.parse(e.newValue) as { state?: { tokens?: AuthTokens | null; user?: User | null } }).state
        : null;
      if (next?.tokens?.accessToken) {
        useAuthStore.setState({ tokens: next.tokens, user: next.user ?? useAuthStore.getState().user });
      } else if (useAuthStore.getState().tokens) {
        useAuthStore.setState({ tokens: null, user: null });
      }
    } catch {
      // Malformed storage payload — leave this tab's state alone.
    }
  });
}

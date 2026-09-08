import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';

// Prefer the configured API URL; fall back to the live backend (never localhost
// in a production bundle) so a missing env var can't silently break the app.
const API_URL: string =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? 'http://localhost:3000/api' : 'https://together-ai-production.up.railway.app/api');

/** Shared axios instance — the ONLY place HTTP is issued. Components never call fetch(). */
export const http: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
  /**
   * ── CREDENTIALED, SINCE 6 SEP ─────────────────────────────────────────────
   *
   * This was off, and the note here explained why: a credentialed request needs
   * the API to echo the exact origin and send Allow-Credentials, and a CORS
   * drift to `*` would block EVERY response including login — surfacing as a
   * bogus "Invalid handle or password". That risk is real and it is bounded:
   * main.ts refuses to start with `CORS_ORIGIN=*` in production, and the
   * origin function it passes to `enableCors` echoes the request origin rather
   * than a wildcard.
   *
   * What the note cost was larger. With this off, the HttpOnly `tc_refresh`
   * cookie the server has always set was never sent, so the 60-day refresh
   * token lived in localStorage — readable by any script on the origin, which
   * means one XSS, or one bad dependency in this bundle, is sixty days of
   * somebody's blood tests, prescriptions, vault, mail, wallet and dating
   * conversations. The server side was already built for the other way round,
   * down to withholding the token from the body on the cookie path.
   *
   * The cookie is cross-site (Vercel ↔ Railway), so Safari's ITP blocks it and
   * the localStorage fallback stays for those browsers — the store decides
   * which of the two it is on, per browser, and persists nothing where the
   * cookie works. Same-siting the API (api.togethercity.app) removes the
   * fallback entirely; until then this is the half that can be done in code.
   */
  withCredentials: true,
});

/**
 * True when a request never got an HTTP response at all — DNS failure
 * (ERR_NAME_NOT_RESOLVED), the backend being unreachable, a CORS block, or a
 * timeout. In every one of those cases axios leaves `response` undefined. UI
 * should show a "can't reach server" message here, NOT a domain error like
 * "invalid password" (which wrongly blames the user for an infra outage).
 */
export function isServerUnreachable(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { response?: unknown }).response == null;
}
export const SERVER_UNREACHABLE_MSG =
  "Can't reach the Together City server right now — please check your connection and try again in a moment.";

http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Never try to refresh on the auth endpoints themselves (a 401 there IS the
// signal that the session is dead) — that would loop.
const isAuthEndpoint = (url?: string) => !!url && /\/auth\/(refresh|login|register|logout)/.test(url);

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint(original.url)) {
      original._retried = true;
      // The store's refresh() is single-flight across EVERY caller (this
      // interceptor, hydrate, anything else) — one rotation per burst of 401s.
      const token = await useAuthStore.getState().refresh();
      if (token) { original.headers.Authorization = `Bearer ${token}`; return http(original); }
      // A definitive rejection already cleared the session inside the store;
      // an outage kept it, and this request fails honestly instead.
    }
    return Promise.reject(error);
  },
);

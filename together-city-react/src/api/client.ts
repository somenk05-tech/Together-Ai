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
  // NOTE: we deliberately do NOT set `withCredentials: true`. This is a
  // cross-origin app (frontend on Vercel, API on Railway). Credentialed
  // requests require the API to echo the exact origin in
  // Access-Control-Allow-Origin AND send Allow-Credentials:true — if the
  // deployed backend ever answers with `*` (or the CORS config drifts), the
  // browser blocks EVERY response, including login, which surfaces to users as
  // a bogus "Invalid handle or password". Persistent sessions run entirely on
  // the Bearer access token + the refresh token stored in localStorage, so no
  // cookie is needed. Keep this off unless the API is same-origin.
});

http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
// Never try to refresh on the auth endpoints themselves (a 401 there IS the
// signal that the session is dead) — that would loop.
const isAuthEndpoint = (url?: string) => !!url && /\/auth\/(refresh|login|register|logout)/.test(url);

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint(original.url)) {
      original._retried = true;
      // Single shared refresh for all concurrent 401s (no storm of refresh calls).
      refreshing ??= useAuthStore.getState().refresh().finally(() => { refreshing = null; });
      const token = await refreshing;
      if (token) { original.headers.Authorization = `Bearer ${token}`; return http(original); }
      // Refresh already cleared the session inside the store; nothing else to do.
    }
    return Promise.reject(error);
  },
);

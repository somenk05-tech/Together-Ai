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
});

http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshing ??= useAuthStore.getState().refresh();
      const token = await refreshing;
      refreshing = null;
      if (token) { original.headers.Authorization = `Bearer ${token}`; return http(original); }
      useAuthStore.getState().signOut();
    }
    return Promise.reject(error);
  },
);

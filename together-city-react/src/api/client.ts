import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

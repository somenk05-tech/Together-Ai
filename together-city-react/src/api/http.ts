import type { AxiosRequestConfig } from 'axios';
import type { ZodType } from 'zod';
import { http } from './client';

/**
 * Validated request helpers — every response is parsed against a Zod schema,
 * so runtime data is guaranteed to match the inferred TypeScript types.
 */
export async function apiGet<T>(url: string, schema: ZodType<T>, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.get<unknown>(url, config);
  return schema.parse(data);
}
export async function apiPost<T>(url: string, body: unknown, schema: ZodType<T>, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.post<unknown>(url, body, config);
  return schema.parse(data);
}
export async function apiPut<T>(url: string, body: unknown, schema: ZodType<T>, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.put<unknown>(url, body, config);
  return schema.parse(data);
}
export async function apiPatch<T>(url: string, body: unknown, schema: ZodType<T>, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.patch<unknown>(url, body, config);
  return schema.parse(data);
}
export async function apiDelete<T>(url: string, schema: ZodType<T>, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await http.delete<unknown>(url, config);
  return schema.parse(data);
}

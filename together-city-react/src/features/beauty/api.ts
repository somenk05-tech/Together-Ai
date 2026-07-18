import { AxiosError } from 'axios';
import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Citation { id: string; label: string; ref: string }

export interface BeautyProfile {
  skinType: string; hairType: string; concerns: string[]; saved: boolean;
  concernOptions?: { key: string; label: string }[];
}
export interface BeautyInsight {
  marker: string; status: 'low' | 'normal' | 'high'; value: number;
  concern: string; mechanism: string; advice: string; tags: string[]; citations: Citation[];
}
export interface InsightsResponse {
  granted: boolean; hasPanel: boolean; takenOn: string | null;
  insights: BeautyInsight[]; source: string; disclaimer: string;
}
export interface RecommendedProduct {
  id: string; name: string; category: string; priceInr: number; tags: string[];
  blurb: string; keyIngredient: string; matched: boolean; reasons: string[];
}
export interface ProductsResponse {
  products: RecommendedProduct[];
  personalisedBy: { concerns: string[]; labs: boolean };
  matchedCount: number;
}
export interface BeautyOrder {
  id: string; totalInr: number; status: string;
  items: { id: string; name: string; priceInr: number; qty: number }[]; createdAt: string;
}

/** True when the failure is the Medical Hub's consent gate (403). */
export function isConsentBlocked(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 403;
}

export const beautyApi = {
  profile: () => api.get<BeautyProfile>('/beauty/profile').then((r) => r.data),
  saveProfile: (input: { skinType: string; hairType: string; concerns: string[] }) =>
    api.put<BeautyProfile>('/beauty/profile', input).then((r) => r.data),
  insights: () => api.get<InsightsResponse>('/beauty/insights').then((r) => r.data),
  products: () => api.get<ProductsResponse>('/beauty/products').then((r) => r.data),
  orders: () => api.get<BeautyOrder[]>('/beauty/orders').then((r) => r.data),
  placeOrder: (items: { id: string; name: string; priceInr: number; qty: number }[], method: 'wallet' | 'card' = 'wallet') =>
    api.post<{ orderId: string; orders: BeautyOrder[] }>('/beauty/orders', { items, method }).then((r) => r.data),
};

export function useBeautyProfile() {
  return useQuery({ queryKey: ['beauty', 'profile'], queryFn: () => beautyApi.profile() });
}
export function useSaveBeautyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: beautyApi.saveProfile,
    onSuccess: (p) => {
      qc.setQueryData(['beauty', 'profile'], p);
      void qc.invalidateQueries({ queryKey: ['beauty', 'products'] });
    },
  });
}
export function useBeautyInsights() {
  return useQuery({
    queryKey: ['beauty', 'insights'], queryFn: () => beautyApi.insights(), retry: false,
  });
}
export function useBeautyProducts() {
  return useQuery({ queryKey: ['beauty', 'products'], queryFn: () => beautyApi.products() });
}
export function useBeautyOrders() {
  return useQuery({ queryKey: ['beauty', 'orders'], queryFn: () => beautyApi.orders() });
}
export function usePlaceBeautyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { items: { id: string; name: string; priceInr: number; qty: number }[]; method: 'wallet' | 'card' }) => beautyApi.placeOrder(v.items, v.method),
    onSuccess: (res) => { qc.setQueryData(['beauty', 'orders'], res.orders); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}

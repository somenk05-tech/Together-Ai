import { AxiosError } from 'axios';
import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Extract a friendly message from a failed payment (e.g. insufficient balance). */
export function payError(err: unknown): string {
  if (err instanceof AxiosError) {
    const m = (err.response?.data as { message?: string } | undefined)?.message;
    if (m) return m;
  }
  return 'Payment failed.';
}

export interface Service { key: string; label: string; hub: string; category: string; amountInr: number; note: string }

export type PayMethod = 'wallet' | 'card';
export interface Card { brand: string; last4: string; name: string }
export interface Txn { id: string; date: string; hub: string; category: string; label: string; amountInr: number; direction: 'debit' | 'credit' }
export interface Wallet { balanceInr: number; spentThisMonthInr: number; lifetimeSpendInr: number; recent: Txn[]; card: Card | null }
export interface CategorySpend { category: string; label: string; hint: string; amountInr: number; pct: number }
export interface Spending { totalInr: number; prevTotalInr: number; trendPct: number | null; byCategory: CategorySpend[]; txnCount: number }
export interface Budget { category: string; label: string; hint: string; monthlyInr: number; spentInr: number; pct: number; over: boolean; isDefault: boolean }

export const financialApi = {
  wallet: () => api.get<Wallet>('/financial/wallet').then((r) => r.data),
  topUp: (amountInr: number) => api.post<{ balanceInr: number }>('/financial/wallet/top-up', { amountInr }).then((r) => r.data),
  transactions: () => api.get<Txn[]>('/financial/transactions').then((r) => r.data),
  spending: () => api.get<Spending>('/financial/spending').then((r) => r.data),
  budgets: () => api.get<Budget[]>('/financial/budgets').then((r) => r.data),
  setBudget: (category: string, monthlyInr: number) => api.put<Budget[]>('/financial/budgets', { category, monthlyInr }).then((r) => r.data),
  services: () => api.get<Service[]>('/financial/services').then((r) => r.data),
  linkCard: (input: { brand?: string; last4?: string; name?: string }) => api.post<Card>('/financial/card', input).then((r) => r.data),
  removeCard: () => api.delete('/financial/card').then((r) => r.data),
  pay: (input: { hub?: string; category?: string; label: string; amountInr: number; method?: PayMethod }) =>
    api.post<{ paid: boolean; balanceInr: number }>('/financial/pay', input).then((r) => r.data),
};

export function useWallet() {
  return useQuery({ queryKey: ['financial', 'wallet'], queryFn: () => financialApi.wallet() });
}
export function useTopUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountInr: number) => financialApi.topUp(amountInr),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}
export function useTransactions() {
  return useQuery({ queryKey: ['financial', 'transactions'], queryFn: () => financialApi.transactions() });
}
export function useSpending() {
  return useQuery({ queryKey: ['financial', 'spending'], queryFn: () => financialApi.spending() });
}
export function useBudgets() {
  return useQuery({ queryKey: ['financial', 'budgets'], queryFn: () => financialApi.budgets() });
}
export function useServices() {
  return useQuery({ queryKey: ['financial', 'services'], queryFn: () => financialApi.services() });
}
export function useLinkCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { brand?: string; last4?: string; name?: string }) => financialApi.linkCard(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['financial', 'wallet'] }),
  });
}
export function useRemoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => financialApi.removeCard(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['financial', 'wallet'] }),
  });
}
/**
 * usePayBill lived here. It took a label and an amount and charged the city
 * wallet for whatever you named — which is fine as a primitive and was, in
 * practice, only ever called by a Payments page whose bills were invented
 * (FE-22.1). With that page gone the hook had no caller, and a hook that debits
 * a wallet for an arbitrary string is not something to leave lying about
 * waiting for a use. The endpoint it called, POST /financial/pay, is still
 * there and still used by financial.charge's other callers.
 */
export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { category: string; monthlyInr: number }) => financialApi.setBudget(v.category, v.monthlyInr),
    onSuccess: (rows) => qc.setQueryData(['financial', 'budgets'], rows),
  });
}

export const catColor: Record<string, string> = { nutrition: '#2e7d32', beauty: '#8c203c', medical: '#1565c0', dating: '#ad1457', wallet: '#e65100' };
export const catIcon: Record<string, string> = { nutrition: '🥗', beauty: '🧴', medical: '🩺', dating: '💘', wallet: '💳' };
export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

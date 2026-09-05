import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

/**
 * THE TILL, FROM THE BROWSER.
 *
 * One client for both audiences, because it is one system: `/pay/invoices/*` is
 * what a citizen holds and `/pay/business/*` is what a business runs, and
 * splitting them into two files would mean two copies of the same money types.
 *
 * EVERY AMOUNT IS A WHOLE RUPEE INTEGER, all the way up from the column. There
 * is no place in this file where a number becomes a float, and `inr()` is the
 * only thing that turns one into a string.
 */

export type InvoiceStatus =
  | 'draft' | 'sent' | 'viewed' | 'part_paid' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

export interface InvoiceLine {
  id: string; name: string; description?: string;
  qty: number; unitPriceInr: number; amountInr: number;
}

export interface PaymentAttempt {
  id: string; status: string; amountInr: number; walletInr: number; cardInr: number;
  refundedInr: number; at: string; failureMessage?: string;
  transactionRef?: string; providerRef?: string;
}

export interface InvoiceSummary {
  id: string; number: string; status: InvoiceStatus; statusLabel: string;
  subtotalInr: number; discountInr: number; taxInr: number; extraInr: number;
  totalInr: number; paidInr: number; refundedInr: number; outstandingInr: number;
  payable: boolean; notes?: string; dueOn?: string; cancelReason?: string;
  issuedAt: string; paidAt?: string;
  businessName?: string; customerName?: string; customerId?: string; listingId: string;
}

export interface Invoice extends InvoiceSummary {
  side: 'customer' | 'business';
  businessHref?: string;
  items: InvoiceLine[];
  payments: PaymentAttempt[];
}

export interface Quote {
  invoiceId: string; number: string; dueInr: number; balanceInr: number;
  card: { brand: string; last4: string; name: string } | null;
  walletInr: number; cardInr: number; needsCard: boolean;
  /** False until a payment partner is signed — the server says, the sheet does not guess. */
  cardAvailable: boolean;
}

export interface PaidResult {
  paid: boolean; replayed: boolean; invoice: Invoice; balanceInr: number;
  payment: {
    id: string; status: string; amountInr: number; walletInr: number; cardInr: number;
    transactionRef: string; at: string; failureMessage?: string;
  };
}

export interface Customer { id: string; name: string; alias: string; lastSpokeAt: string }

export interface DraftLine { name: string; description?: string; qty: number; unitPriceInr: number }

export interface PayoutRow {
  id: string; reference: string; status: string; statusLabel: string;
  netInr: number; on: string; settledAt?: string; failureReason?: string;
}

export interface PayoutAccountCard {
  legalName: string; entityKind: string; last4?: string; bankName?: string; taxRef?: string;
  status: string; payoutsEnabled: boolean; holdReason?: string; rejectReason?: string;
}

export interface Onboarding {
  stage: 'not_started' | 'verification_required' | 'under_review' | 'verified' | 'payouts_enabled' | 'payouts_on_hold';
  next: string;
  /** False until the city has a payment partner that can send money: the
   *  account form is not drawn, and the server refuses it anyway (5 Sep). */
  payoutsAvailable: boolean;
  identityVerified: boolean;
  businessVerified: boolean;
  account: PayoutAccountCard | null;
  fee: { rateBp: number; flatInr: number; taxOnFeeBp: number };
}

export interface Dashboard {
  businessName: string;
  /** The payout rail is the sandbox: nothing below has reached a bank (5 Sep). */
  sandbox?: boolean;
  settledInr: number; pendingInr: number; todayInr: number;
  totalSalesInr: number; refundedInr: number; feesInr: number;
  nextPayout: { amountInr: number; on: string; status: string; statusLabel: string } | null;
  payouts: PayoutRow[];
  account: PayoutAccountCard | null;
  transactions: Array<{ id: string; kind: string; amountInr: number; note: string; at: string; invoiceId?: string }>;
}

export interface Settlement {
  id: string; reference: string; status: string; statusLabel: string;
  grossInr: number; feeInr: number; taxInr: number; adjustInr: number; netInr: number;
  on: string; settledAt?: string; destinationLast4?: string; failureReason?: string;
  listingId: string;
  items: Array<{ id: string; invoiceId: string; invoiceNumber: string; grossInr: number; feeInr: number; taxInr: number; netInr: number }>;
}

export const payApi = {
  myInvoices: () => api.get<{ items: InvoiceSummary[]; dueInr: number }>('/pay/invoices').then((r) => r.data),
  invoice: (id: string) => api.get<Invoice>(`/pay/invoices/${id}`).then((r) => r.data),
  quote: (id: string, useWallet: boolean) =>
    api.get<Quote>(`/pay/invoices/${id}/quote`, { params: { wallet: useWallet ? 'on' : 'off' } }).then((r) => r.data),
  /**
   * THE ONE CALL THAT MOVES MONEY, and the only one in this file that carries a
   * header. `Idempotency-Key` is minted once per sheet opening, not per press,
   * so a second tap on a slow connection repeats the attempt instead of making
   * a new one — which is the whole point of the key existing.
   */
  pay: (id: string, body: { expectInr: number; useWallet: boolean }, idempotencyKey: string) =>
    api.post<PaidResult>(`/pay/invoices/${id}/pay`, body, { headers: { 'Idempotency-Key': idempotencyKey } })
      .then((r) => r.data),

  customers: (listingId: string) =>
    api.get<{ items: Customer[] }>(`/pay/business/${listingId}/customers`).then((r) => r.data),
  businessInvoices: (listingId: string, status: string) =>
    api.get<{ items: InvoiceSummary[]; counts: Record<string, number> }>(
      `/pay/business/${listingId}/invoices`, { params: { status } },
    ).then((r) => r.data),
  createInvoice: (listingId: string, body: Record<string, unknown>) =>
    api.post<Invoice>(`/pay/business/${listingId}/invoices`, body).then((r) => r.data),
  dashboard: (listingId: string) =>
    api.get<Dashboard>(`/pay/business/${listingId}/payments`).then((r) => r.data),
  onboarding: (listingId: string) =>
    api.get<Onboarding>(`/pay/business/${listingId}/account`).then((r) => r.data),
  saveAccount: (listingId: string, body: Record<string, unknown>) =>
    api.post<Onboarding>(`/pay/business/${listingId}/account`, body).then((r) => r.data),
  payout: (id: string) => api.get<Settlement>(`/pay/business/payouts/${id}`).then((r) => r.data),

  sendInvoice: (id: string) => api.post<Invoice>(`/pay/business/invoices/${id}/send`, {}).then((r) => r.data),
  cancelInvoice: (id: string, reason: string) =>
    api.post<Invoice>(`/pay/business/invoices/${id}/cancel`, { reason }).then((r) => r.data),
  refundInvoice: (id: string, amountInr: number, reason: string) =>
    api.post<Invoice>(`/pay/business/invoices/${id}/refund`, { amountInr, reason }).then((r) => r.data),
  deleteDraft: (id: string) => api.delete<{ ok: boolean }>(`/pay/business/invoices/${id}`).then((r) => r.data),
};

// ── hooks ───────────────────────────────────────────────────────────────────

/**
 * One prefix for the whole Till, so a payment can invalidate everything it
 * touched — the invoice, both lists, the merchant dashboard — without naming
 * each of them and getting one wrong.
 */
const KEY = 'pay';
const wipe = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: [KEY] });
  // Paying moves the city wallet too, and the Financial hub keeps its own key.
  void qc.invalidateQueries({ queryKey: ['financial'] });
  void qc.invalidateQueries({ queryKey: ['services'] });
};

export function useMyInvoices() {
  return useQuery({ queryKey: [KEY, 'mine'], queryFn: () => payApi.myInvoices() });
}
export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'invoice', id ?? ''],
    queryFn: () => payApi.invoice(id as string),
    enabled: !!id,
  });
}
export function useQuote(id: string | undefined, useWallet: boolean, open: boolean) {
  return useQuery({
    queryKey: [KEY, 'quote', id ?? '', useWallet],
    queryFn: () => payApi.quote(id as string, useWallet),
    enabled: !!id && open,
  });
}
export function usePayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; expectInr: number; useWallet: boolean; idempotencyKey: string }) =>
      payApi.pay(v.id, { expectInr: v.expectInr, useWallet: v.useWallet }, v.idempotencyKey),
    onSuccess: () => wipe(qc),
  });
}

export function useBillableCustomers(listingId: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'customers', listingId ?? ''],
    queryFn: () => payApi.customers(listingId as string),
    enabled: !!listingId,
  });
}
export function useBusinessInvoices(listingId: string | undefined, status: string) {
  return useQuery({
    queryKey: [KEY, 'business', listingId ?? '', status],
    queryFn: () => payApi.businessInvoices(listingId as string, status),
    enabled: !!listingId,
  });
}
export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { listingId: string; body: Record<string, unknown> }) =>
      payApi.createInvoice(v.listingId, v.body),
    onSuccess: () => wipe(qc),
  });
}
export function useSendInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => payApi.sendInvoice(id), onSuccess: () => wipe(qc) });
}
export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => payApi.cancelInvoice(v.id, v.reason),
    onSuccess: () => wipe(qc),
  });
}
export function useRefundInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; amountInr: number; reason: string }) =>
      payApi.refundInvoice(v.id, v.amountInr, v.reason),
    onSuccess: () => wipe(qc),
  });
}
export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => payApi.deleteDraft(id), onSuccess: () => wipe(qc) });
}

export function useMerchantDashboard(listingId: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'dashboard', listingId ?? ''],
    queryFn: () => payApi.dashboard(listingId as string),
    enabled: !!listingId,
  });
}
export function useOnboarding(listingId: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'onboarding', listingId ?? ''],
    queryFn: () => payApi.onboarding(listingId as string),
    enabled: !!listingId,
  });
}
export function useSavePayoutAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { listingId: string; body: Record<string, unknown> }) =>
      payApi.saveAccount(v.listingId, v.body),
    onSuccess: () => wipe(qc),
  });
}
export function usePayout(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'payout', id ?? ''],
    queryFn: () => payApi.payout(id as string),
    enabled: !!id,
  });
}

// ── words and numbers ───────────────────────────────────────────────────────

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

/** The message the server wrote, or a sentence that admits we do not know. */
export function payError(err: unknown, fallback = 'That did not go through. Nothing has been taken.'): string {
  if (err instanceof AxiosError) {
    const raw = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(raw)) return raw.join(' ');
    if (raw) return raw;
  }
  return fallback;
}

/**
 * A KEY PER SHEET, NOT PER PRESS.
 *
 * Minted when the pay sheet opens and reused for every attempt from it, so a
 * second tap after a dropped connection is recognised as the same payment. A
 * key minted per press would make every retry a fresh charge, which is the bug
 * idempotency keys exist to prevent.
 *
 * `crypto.randomUUID` where it exists; the fallback is for older WebViews, and
 * it only has to be unique within one citizen's session.
 */
export function newPaymentKey(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `pk-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * The colour a status chip wears. Tokens only — a status is pass/fail/waiting,
 * which is exactly what the ok / warn / danger inks are for.
 */
export const STATUS_INK: Record<string, { ink: string; soft: string }> = {
  draft: { ink: 'var(--muted)', soft: 'transparent' },
  sent: { ink: 'var(--accent-ink)', soft: 'var(--accent-soft)' },
  viewed: { ink: 'var(--accent-ink)', soft: 'var(--accent-soft)' },
  part_paid: { ink: 'var(--warn-ink)', soft: 'transparent' },
  paid: { ink: 'var(--ok-ink)', soft: 'var(--ok-soft)' },
  overdue: { ink: 'var(--danger-ink)', soft: 'transparent' },
  cancelled: { ink: 'var(--muted)', soft: 'transparent' },
  refunded: { ink: 'var(--muted)', soft: 'transparent' },
  // Payout states share the vocabulary; they are the same kind of answer.
  on_hold: { ink: 'var(--warn-ink)', soft: 'transparent' },
  pending: { ink: 'var(--muted)', soft: 'transparent' },
  scheduled: { ink: 'var(--accent-ink)', soft: 'var(--accent-soft)' },
  processing: { ink: 'var(--accent-ink)', soft: 'var(--accent-soft)' },
  settled: { ink: 'var(--ok-ink)', soft: 'var(--ok-soft)' },
  failed: { ink: 'var(--danger-ink)', soft: 'transparent' },
  returned: { ink: 'var(--danger-ink)', soft: 'transparent' },
  reversed: { ink: 'var(--muted)', soft: 'transparent' },
};

/** 17 Aug 2026 — the way a date is written on a document, not on a clock. */
export function onDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * THE ARITHMETIC, WITH NOTHING ELSE IN IT.
 *
 * No Prisma, no clock, no injection. Every number a business or a citizen is
 * shown in the Till comes out of one of these functions, so the spec beside
 * this file can prove the money is right without booting anything — which is
 * the only kind of proof worth having about money.
 *
 * WHOLE RUPEES, AS INTEGERS. The city has never shown anybody a paisa, and a
 * float in a money column is a reconciliation failure with a delay fuse. Where
 * a percentage produces a fraction it is rounded ONCE, at the point it becomes
 * a stored number, and the rounding rule is written down beside it.
 */

/** A line as the business typed it, before anything is worked out. */
export interface DraftItem {
  name: string;
  description?: string | null;
  qty: number;
  unitPriceInr: number;
}

/** A line after the arithmetic, ready to store. */
export interface PricedItem extends DraftItem {
  amountInr: number;
  position: number;
}

export interface InvoiceTotals {
  items: PricedItem[];
  subtotalInr: number;
  discountInr: number;
  taxInr: number;
  extraInr: number;
  totalInr: number;
}

/**
 * What the invoice comes to.
 *
 * THE ORDER IS THE ARGUMENT. Discount comes off the subtotal, tax is charged on
 * what is left, and additional charges are added after tax. Any other order
 * produces a different number, and the one a customer would dispute is tax
 * charged on money they were never asked for. A trade that must tax its
 * call-out fee raises the fee's own line instead — that is a line item, and
 * this is the one place the sequence is decided.
 *
 * TAX ARRIVES AS A RATE IN BASIS POINTS, not as an amount. A business typing
 * "18" and a business typing "₹873" are answering different questions, and
 * storing the second loses the first: an invoice edited afterwards would keep
 * yesterday's tax against today's items. Rounded half-up at the end, once.
 */
export function priceInvoice(input: {
  items: DraftItem[];
  discountInr?: number;
  taxRateBp?: number;
  extraInr?: number;
}): InvoiceTotals {
  const items: PricedItem[] = input.items.map((it, i) => ({
    ...it,
    qty: Math.max(1, Math.trunc(it.qty)),
    unitPriceInr: Math.max(0, Math.trunc(it.unitPriceInr)),
    amountInr: Math.max(1, Math.trunc(it.qty)) * Math.max(0, Math.trunc(it.unitPriceInr)),
    position: i,
  }));

  const subtotalInr = items.reduce((s, it) => s + it.amountInr, 0);
  // A discount larger than the subtotal is a typo, not a credit note. Clamped
  // rather than refused, because refusing loses everything else they typed.
  const discountInr = Math.min(subtotalInr, Math.max(0, Math.trunc(input.discountInr ?? 0)));
  const taxable = subtotalInr - discountInr;
  const taxRateBp = Math.min(10_000, Math.max(0, Math.trunc(input.taxRateBp ?? 0)));
  const taxInr = Math.round((taxable * taxRateBp) / 10_000);
  const extraInr = Math.max(0, Math.trunc(input.extraInr ?? 0));

  return {
    items,
    subtotalInr,
    discountInr,
    taxInr,
    extraInr,
    totalInr: taxable + taxInr + extraInr,
  };
}

// ── the split ───────────────────────────────────────────────────────────────

export interface Split {
  walletInr: number;
  cardInr: number;
}

/**
 * HOW MUCH COMES OUT OF THE WALLET, AND HOW MUCH OFF THE CARD.
 *
 * The brief's headline feature, and the whole of it is one line of arithmetic —
 * which is worth saying, because the reason split payments usually go wrong is
 * not the sum. It is that the sum lives in four places: the sheet that draws
 * the two rows, the button that says how much, the server that charges, and the
 * receipt. Here it lives once, and the other three call it.
 *
 * `useWallet` is the citizen's choice, not a capability. Somebody with ₹12,000
 * in the wallet may still want the whole thing on the card, and a wallet toggle
 * that silently means "if there is enough" is a toggle nobody trusts twice.
 *
 * WHAT THIS WILL NOT DO is return a wallet leg bigger than the balance. Asking
 * for one is not an error the citizen made — the sheet offers exactly what is
 * there — so it is clamped rather than thrown, and the card covers the rest.
 */
export function splitFor(input: { amountInr: number; balanceInr: number; useWallet: boolean }): Split {
  const amount = Math.max(0, Math.trunc(input.amountInr));
  if (!input.useWallet) return { walletInr: 0, cardInr: amount };
  const walletInr = Math.min(amount, Math.max(0, Math.trunc(input.balanceInr)));
  return { walletInr, cardInr: amount - walletInr };
}

// ── what the city keeps ─────────────────────────────────────────────────────

/**
 * THE RATE CARD FOR TAKING MONEY, IN ONE PLACE.
 *
 * Two percent and three rupees, plus GST on the fee itself — which is a fee
 * structure and not a claim about what any real processor charges. When a
 * provider is signed, this object is what changes, and the settlement statement
 * keeps showing its working either way.
 *
 * GST IS CHARGED ON THE FEE, NOT ON THE SALE. The sale's own tax is the
 * business's, collected on the invoice and settled to them; this is the tax on
 * the service Together City sold the business. Conflating the two would show a
 * merchant a deduction they cannot reconcile against anything.
 */
export const FEE = {
  /** Basis points of the invoice total. 200 = 2%. */
  rateBp: 200,
  /** A flat rupee amount per successful payment, on top of the percentage. */
  flatInr: 3,
  /** GST on the fee. 1800 = 18%. */
  taxOnFeeBp: 1800,
} as const;

export interface FeeBreakdown {
  grossInr: number;
  feeInr: number;
  taxInr: number;
  netInr: number;
}

/**
 * What a business actually receives for a sale, and the two deductions between.
 *
 * Rounded half-up, once each. Rounding the fee and the tax separately can put
 * the net a rupee away from `gross − (fee + tax)` computed in one step, so the
 * net is derived by subtraction rather than computed independently: the three
 * numbers on the statement always add up, because two of them are the answer
 * and the third is what is left.
 */
export function feeFor(grossInr: number): FeeBreakdown {
  const gross = Math.max(0, Math.trunc(grossInr));
  const feeInr = gross === 0 ? 0 : Math.round((gross * FEE.rateBp) / 10_000) + FEE.flatInr;
  const taxInr = Math.round((feeInr * FEE.taxOnFeeBp) / 10_000);
  return { grossInr: gross, feeInr, taxInr, netInr: gross - feeInr - taxInr };
}

// ── when the money leaves ───────────────────────────────────────────────────

/**
 * THE NEXT WORKING DAY, from a day the caller supplies.
 *
 * No `new Date()` in here. The clock belongs to the caller for the same reason
 * `hours.ts` gives: a function that reads the time cannot be tested for the
 * Friday case without waiting until Friday.
 *
 * Saturday and Sunday only. Bank holidays are real and are not modelled — a
 * hard-coded holiday table is wrong within a year and wrong differently in
 * every state, and the honest version of that promise comes from the payout
 * provider's own calendar when one is wired. Until then the business is told
 * "expected", which is what the word is for.
 */
export function nextBusinessDay(from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 1);
  // 0 = Sunday, 6 = Saturday.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** YYYY-MM-DD for a day-shaped value, with no timezone in the answer. */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

// ── the invoice's own state ─────────────────────────────────────────────────

export type InvoiceStatus =
  | 'draft' | 'sent' | 'viewed' | 'part_paid' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

/**
 * WHAT AN INVOICE'S STATUS IS, worked out rather than written down.
 *
 * The brief's last line about payment is the one that matters most here: never
 * show an invoice as Paid until payment confirmation is received. The way to
 * keep that promise is for no route to be able to set `paid` at all — so this
 * takes only facts (what has been banked, what was cancelled, what day it is)
 * and returns the only status those facts support.
 *
 * OVERDUE IS COMPUTED AND NEVER STORED, which is the same argument the trust
 * ladder makes about tiers: a status column that depends on the date is wrong
 * from midnight until whatever job fixes it runs, and there is no such job.
 * A partly-paid invoice past its due date still reads `part_paid` — the money
 * that did arrive is the more useful fact, and a business chasing the balance
 * knows it is late without a label.
 */
export function statusOf(inv: {
  totalInr: number;
  paidInr: number;
  refundedInr: number;
  sentAt: Date | null;
  viewedAt: Date | null;
  cancelledAt: Date | null;
  dueOn: Date | null;
}, today: Date): InvoiceStatus {
  if (inv.cancelledAt) return 'cancelled';
  if (inv.paidInr > 0 && inv.refundedInr >= inv.paidInr) return 'refunded';
  if (inv.paidInr >= inv.totalInr && inv.totalInr > 0) return 'paid';
  if (inv.paidInr > 0) return 'part_paid';
  if (!inv.sentAt) return 'draft';
  if (inv.dueOn && dayKey(inv.dueOn) < dayKey(today)) return 'overdue';
  return inv.viewedAt ? 'viewed' : 'sent';
}

/** Statuses a citizen can still pay. Everything else is closed or not theirs yet. */
export const PAYABLE: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'sent', 'viewed', 'part_paid', 'overdue',
]);

/** What is still owed on an invoice. Never negative, even after an overpayment. */
export const outstandingInr = (inv: { totalInr: number; paidInr: number }): number =>
  Math.max(0, inv.totalInr - inv.paidInr);

/**
 * THE LINE BETWEEN TOGETHER CITY AND A COMPANY WITH A LICENCE.
 *
 * Together City holds the invoice, the relationship, the wallet ledger, the
 * payment's state and the receipt. It does not hold a card number, an account
 * number, an IFSC or a CVV, and it does not move regulated funds. Everything on
 * the other side of that line goes through the two interfaces below.
 *
 * WHY AN INTERFACE AND NOT A RAZORPAY CLIENT. Not portability for its own sake
 * — the real reason is that a mock and a live provider must be indistinguishable
 * to everything upstream, or the prototype proves nothing about the product. The
 * split-payment logic, the state machine, the ledger, the settlement arithmetic
 * and every screen in the Till are written against these types and have never
 * seen a provider. Signing one is implementing two interfaces and changing one
 * line in the module.
 *
 * WHAT THE INTERFACE DELIBERATELY CANNOT EXPRESS: taking a card number. There
 * is no `cardNumber` field anywhere below and there must never be one. A card
 * is authorised by the provider's own sheet or SDK, and what comes back to us
 * is a token and four digits. If a future provider seems to require raw PAN,
 * that is a signal about the provider.
 *
 * IDEMPOTENCY IS PART OF THE CONTRACT, not an implementation detail. Every
 * method that moves money takes a key, and a provider that is handed the same
 * key twice must return the same result rather than charge twice. The mock
 * below honours that, so a double tap is exercised in development rather than
 * discovered in production.
 */

export type ChargeStatus = 'succeeded' | 'failed';

export interface ChargeRequest {
  /** Rupees, whole. */
  amountInr: number;
  /** The provider's token for the citizen's saved instrument. Never a number. */
  instrumentRef: string;
  /** Ours, so a support conversation can start from either side. */
  reference: string;
  /** Same key twice must mean one charge. */
  idempotencyKey: string;
}

export interface ChargeResult {
  status: ChargeStatus;
  /** The provider's id for the charge. Present on success, and on a failure
   *  the provider actually recorded — which is most of them, and is what makes
   *  a failed payment traceable rather than merely absent. */
  providerRef?: string;
  /** Machine-readable, in the provider's own vocabulary. */
  code?: string;
  /** What to show a person. Providers write these for developers; the service
   *  layer translates before anything reaches a screen. */
  message?: string;
}

export interface RefundRequest {
  providerRef: string;
  amountInr: number;
  idempotencyKey: string;
}

export interface RefundResult {
  status: 'succeeded' | 'failed';
  providerRef?: string;
  message?: string;
}

/** Taking money from a citizen. */
export interface PaymentProvider {
  readonly name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(req: RefundRequest): Promise<RefundResult>;
}

// ── the other direction ─────────────────────────────────────────────────────

export interface PayoutAccountRequest {
  legalName: string;
  entityKind: string;
  /** As typed by the owner. Passed straight through and NEVER stored by us —
   *  the provider is what keeps it. See `MerchantAccount` in the schema. */
  accountNumber: string;
  ifsc: string;
  taxRef?: string | null;
}

export interface PayoutAccountResult {
  status: 'accepted' | 'rejected';
  /** The handle we keep. Everything else about the account stays over there. */
  accountRef?: string;
  /** For a human to recognise their own account by. */
  last4?: string;
  bankName?: string;
  message?: string;
}

export interface TransferRequest {
  accountRef: string;
  amountInr: number;
  reference: string;
  idempotencyKey: string;
}

export interface TransferResult {
  status: 'processing' | 'settled' | 'failed';
  providerRef?: string;
  message?: string;
}

/** Sending money to a business. */
export interface PayoutProvider {
  readonly name: string;
  registerAccount(req: PayoutAccountRequest): Promise<PayoutAccountResult>;
  transfer(req: TransferRequest): Promise<TransferResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');

/**
 * A BANK CODE IS NOT AN ACCOUNT NUMBER, and the difference is what we may keep.
 *
 * The first four characters of an IFSC identify the bank and nothing else —
 * HDFC0001234 says HDFC, and every HDFC customer in the country shares it. The
 * remaining seven identify a branch, which narrows a person down a great deal,
 * so they are dropped. This is the whole of what the schema's `bankName` is
 * derived from until a provider returns a real one.
 */
export const bankCodeOf = (ifsc: string): string => ifsc.trim().slice(0, 4).toUpperCase();

/** The last four digits of an account number, and nothing before them. */
export const last4Of = (accountNumber: string): string => accountNumber.replace(/\D/g, '').slice(-4);

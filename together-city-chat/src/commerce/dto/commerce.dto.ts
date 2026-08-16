import { z } from 'zod';

/**
 * WHAT A BUSINESS SENDS, AND WHAT A CITIZEN SENDS BACK.
 *
 * Two rules run through all of it. Amounts are whole rupees and never floats,
 * because the schema stores integers and a float arriving here would be
 * silently truncated somewhere further in. And no status ever appears in a
 * request body: an invoice's state is worked out from what has happened to it
 * (commerce/money.ts, `statusOf`), so there is deliberately no shape here that
 * could carry the word "paid".
 */

const rupees = (max: number) =>
  z.number().int('Amounts are in whole rupees.').min(0).max(max);

export const InvoiceItemSchema = z.object({
  name: z.string().trim().min(1, 'Every line needs a name.').max(120),
  description: z.string().trim().max(400).optional(),
  qty: z.number().int().min(1).max(9_999).default(1),
  unitPriceInr: rupees(10_00_000),
});

/**
 * A DRAFT, OR A FINISHED INVOICE — the same shape either way.
 *
 * Nothing here is required except one line with a name, because a draft is
 * something a business starts in a doorway with a phone in one hand. The
 * checks that matter (a customer who exists, a total above zero) are the
 * checks `send` makes, and they are made there rather than here so that
 * saving a half-written invoice never fails.
 */
export const CreateInvoiceSchema = z.object({
  /** The citizen being billed. They must already be talking to this business. */
  customerId: z.string().uuid('Pick a customer from the list.'),
  items: z.array(InvoiceItemSchema).min(1, 'An invoice needs at least one line.').max(40),
  discountInr: rupees(10_00_000).optional(),
  /** Basis points — 1800 is 18%. A rate, not an amount: see money.ts. */
  taxRateBp: z.number().int().min(0).max(10_000).optional(),
  extraInr: rupees(10_00_000).optional(),
  notes: z.string().trim().max(1_200).optional(),
  /** YYYY-MM-DD, the day the business named. */
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD for the due date.').optional(),
});
export type CreateInvoiceDto = z.infer<typeof CreateInvoiceSchema>;

/** Editing a draft. Same fields, none of them required, customer included. */
export const UpdateInvoiceSchema = CreateInvoiceSchema.partial();
export type UpdateInvoiceDto = z.infer<typeof UpdateInvoiceSchema>;

export const CancelInvoiceSchema = z.object({
  /** The citizen reads this. A cancellation with no reason is a phone call. */
  reason: z.string().trim().min(3, 'Say why — the person you billed will read it.').max(300),
});
export type CancelInvoiceDto = z.infer<typeof CancelInvoiceSchema>;

export const RefundInvoiceSchema = z.object({
  amountInr: rupees(10_00_000).refine((n) => n > 0, 'Nothing to refund.'),
  reason: z.string().trim().min(3).max(300),
});
export type RefundInvoiceDto = z.infer<typeof RefundInvoiceSchema>;

/**
 * PAYING. Three fields, and the split is derived rather than dictated.
 *
 * The client says how much it believes is owed and whether the wallet should be
 * used; the server works out the two legs from the live balance. A client that
 * sent `walletInr` and `cardInr` would be a client whose arithmetic could
 * disagree with the wallet's — and the disagreement would be resolved in favour
 * of whichever one happened to be read first.
 *
 * `expectInr` is not the amount to charge. It is the amount the citizen was
 * LOOKING AT when they pressed the button, and it is checked against what is
 * really outstanding: a business that edits an invoice while somebody has it
 * open must not be able to take a different number than the one on the screen.
 */
export const PayInvoiceSchema = z.object({
  expectInr: rupees(10_00_000).refine((n) => n > 0, 'Nothing to pay.'),
  useWallet: z.boolean().default(true),
});
export type PayInvoiceDto = z.infer<typeof PayInvoiceSchema>;

/**
 * THE PAYOUT ACCOUNT — the only place in Together City an account number is
 * ever named, and it is named on its way past.
 *
 * `accountNumber` and `ifsc` are validated for shape here, handed to the payout
 * provider by the service, and never written to a column. The schema has
 * nowhere to put them. See commerce/provider.ts.
 */
export const PayoutAccountSchema = z.object({
  legalName: z.string().trim().min(2, 'The name on the account.').max(140),
  entityKind: z.enum(['individual', 'proprietor', 'registered', 'company']),
  accountNumber: z.string().trim().regex(/^\d{6,20}$/, 'An account number is 6 to 20 digits.'),
  ifsc: z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'An IFSC is four letters, a zero, then six characters.'),
  /** GSTIN or PAN, as printed. Not checksum-validated — the same argument
   *  ServiceVerification.docRef makes. */
  taxRef: z.string().trim().min(6).max(20).optional(),
});
export type PayoutAccountDto = z.infer<typeof PayoutAccountSchema>;

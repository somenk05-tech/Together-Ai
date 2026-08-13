import { z } from 'zod';

export const SPEND_CATEGORIES = ['nutrition', 'beauty', 'medical', 'dating', 'entertainment', 'travel'] as const;

export const TopUpSchema = z.object({
  amountInr: z.number().int().min(1).max(1_000_000),
});
export type TopUpDto = z.infer<typeof TopUpSchema>;

export const SetBudgetSchema = z.object({
  category: z.enum(SPEND_CATEGORIES),
  monthlyInr: z.number().int().min(0).max(10_000_000),
});
export type SetBudgetDto = z.infer<typeof SetBudgetSchema>;

export const PaySchema = z.object({
  hub: z.string().min(1).max(40),
  category: z.enum(SPEND_CATEGORIES),
  label: z.string().min(1).max(80),
  amountInr: z.number().int().min(1).max(10_000_000),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type PayDto = z.infer<typeof PaySchema>;

export const LinkCardSchema = z.object({
  brand: z.string().max(24).optional(),
  last4: z.string().min(2).max(4).optional(),
  name: z.string().max(40).optional(),
});
export type LinkCardDto = z.infer<typeof LinkCardSchema>;

/**
 * ONE LINE OF THE CITIZEN'S OWN SPENDING LOG.
 *
 * `spentOn` is a DAY (YYYY-MM-DD) and not a timestamp, because that is what
 * somebody logging yesterday's coffee is naming. Validated as the shape rather
 * than parsed into a Date here: the service decides what a day means, and a DTO
 * that hands the service a Date has already made that decision for it.
 *
 * THE NOTE IS FREE TEXT AND HAS NO CATEGORY. Making somebody file "auto to
 * work" under one of seven headings before the entry will save is how a log
 * stops being written in. 200 characters is a line somebody types, not an
 * essay; the cap exists so a runaway paste cannot become a row nothing renders.
 *
 * The amount is a paisa-free rupee integer like every other figure in this hub,
 * and it must be positive — a log entry is money that WENT. Something received
 * is a top-up, which is a different thing with a different table behind it.
 */
export const AddSpendLogSchema = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-08-13'),
  note: z.string().trim().min(1, 'Say what it was').max(200),
  amountInr: z.number().int().min(1).max(10_000_000),
});
export type AddSpendLogDto = z.infer<typeof AddSpendLogSchema>;

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

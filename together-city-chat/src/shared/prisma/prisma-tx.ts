import type { Prisma } from '@prisma/client';

/**
 * A transaction-scoped Prisma client — the exact type `$transaction(fn)` hands
 * its callback.
 *
 * Use Prisma's own generated type rather than deriving one. The first attempt
 * was `Omit<PrismaService, '$connect' | '$disconnect' | '$transaction' | …>`,
 * which reads as equivalent and is not: PrismaService also carries Nest's
 * onModuleInit and onModuleDestroy, so the callback demanded a parameter with
 * two methods the real transaction client does not have, and $transaction
 * rejected the function outright.
 *
 * That cost a failed deploy. This repo's type-check environment cannot generate
 * the Prisma client, so every Prisma type reads as `any`-ish locally and an
 * error of exactly this shape is invisible until the real build runs. When
 * touching Prisma's own types, prefer the generated ones over hand-derived
 * equivalents — they are the only version the production compiler agrees with.
 */
export type PrismaTx = Prisma.TransactionClient;

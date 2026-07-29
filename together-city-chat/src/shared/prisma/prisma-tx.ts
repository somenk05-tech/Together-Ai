import type { PrismaService } from './prisma.service';

/**
 * A transaction-scoped Prisma client.
 *
 * Structurally the full client minus the methods that don't exist inside a
 * transaction — you cannot open a nested transaction, and you must not manage
 * the connection from within one. Typing it this way means a caller who tries
 * gets a compile error rather than a runtime surprise.
 */
export type PrismaTx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$transaction' | '$on' | '$use' | '$extends'
>;

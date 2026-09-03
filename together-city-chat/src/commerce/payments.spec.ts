import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { SettlementService } from './settlement.service';
import { SandboxPaymentProvider, SandboxPayoutProvider } from './sandbox.provider';
import { feeFor, nextBusinessDay, dayKey } from './money';
import { FLAGS } from '../dev/feature-flags';

/**
 * THE SPLIT, AGAINST A DATABASE-SHAPED THING.
 *
 * `money.spec.ts` argues about the arithmetic. What is left to prove is what
 * the service does with it — and specifically the three things that cost real
 * money if they are wrong:
 *
 *   · a declined card puts the wallet leg BACK, and the invoice stays unpaid;
 *   · a second tap with the same key charges once;
 *   · nothing writes Paid except money arriving.
 *
 * The harness is the same shape the local-services suites use: an in-memory
 * store with the handful of Prisma methods this path touches, and the real
 * services built over it with `Object.create` so no Nest container is needed.
 */

const T0 = new Date('2026-08-17T09:00:00Z'); // a Monday

interface Invoice {
  id: string; listingId: string; ownerId: string; userId: string; number: string;
  totalInr: number; paidInr: number; refundedInr: number;
  sentAt: Date | null; viewedAt: Date | null; paidAt: Date | null;
  cancelledAt: Date | null; dueOn: Date | null;
}

function harness(opts: { balanceInr?: number; card?: string | null; payoutsEnabled?: boolean } = {}) {
  const invoice: Invoice = {
    id: 'I1', listingId: 'L1', ownerId: 'OWNER', userId: 'CITIZEN', number: 'TC-10482',
    totalInr: 4_850, paidInr: 0, refundedInr: 0,
    sentAt: new Date(T0.getTime() - 3_600_000), viewedAt: null, paidAt: null,
    cancelledAt: null, dueOn: null,
  };
  const intents: Array<Record<string, unknown>> = [];
  const walletTxns: Array<Record<string, unknown>> = [];
  const ledger: Array<Record<string, unknown>> = [];
  const settlements: Array<Record<string, unknown>> = [];
  const settlementItems: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = [];
  const threadLines: Array<Record<string, unknown>> = [];
  let balanceInr = opts.balanceInr ?? 2_350;
  let seq = 0;

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'not' in (v as object)) return row[k] !== (v as { not: unknown }).not;
      if (v && typeof v === 'object' && 'in' in (v as object)) return (v as { in: unknown[] }).in.includes(row[k]);
      return row[k] === v;
    });

  const prisma = {
    $transaction: async (fn: unknown) => (typeof fn === 'function'
      ? (fn as (tx: unknown) => Promise<unknown>)(prisma)
      : Promise.all(fn as Promise<unknown>[])),
    invoice: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const w = { ...where };
        delete w.OR; delete w.sentAt;
        return matches(invoice as unknown as Record<string, unknown>, w) ? { ...invoice } : null;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(invoice, data);
        return { count: 1 };
      },
      count: async () => 0,
    },
    invoiceItem: { findMany: async () => [] },
    paymentIntent: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        intents.find((i) => matches(i, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        if (data.idempotencyKey && intents.some((i) => i.idempotencyKey === data.idempotencyKey)) {
          // What the unique index does, in the only way a fake can do it.
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }
        const row = { id: `PI${seq}`, refundedInr: 0, createdAt: T0, ...data };
        intents.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let n = 0;
        for (const i of intents) if (matches(i, where)) { Object.assign(i, data); n += 1; }
        return { count: n };
      },
      findMany: async () => [...intents],
    },
    cityWallet: {
      findUnique: async () => ({ balanceInr, cardBrand: 'Visa', cardLast4: '4242', cardName: opts.card ?? 'City Card' }),
      upsert: async () => ({ userId: 'CITIZEN', balanceInr, cardBrand: 'Visa', cardLast4: opts.card === null ? null : '4242', cardName: opts.card ?? 'City Card' }),
      update: async ({ data }: { data: { balanceInr?: { increment?: number; decrement?: number } } }) => {
        if (data.balanceInr?.increment) balanceInr += data.balanceInr.increment;
        if (data.balanceInr?.decrement) balanceInr -= data.balanceInr.decrement;
        return { balanceInr };
      },
      updateMany: async ({ where, data }: {
        where: { balanceInr?: { gte: number } };
        data: { balanceInr: { decrement: number } };
      }) => {
        if (where.balanceInr?.gte != null && balanceInr < where.balanceInr.gte) return { count: 0 };
        balanceInr -= data.balanceInr.decrement;
        return { count: 1 };
      },
    },
    walletTxn: {
      create: async ({ data }: { data: Record<string, unknown> }) => { walletTxns.push(data); return data; },
      findMany: async () => [],
    },
    spendLogEntry: { findMany: async () => [] },
    merchantLedgerEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => { ledger.push(data); return data; },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => { ledger.push(...data); return { count: data.length }; },
      findMany: async () => [...ledger],
    },
    settlement: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        settlements.find((s) => s.listingId === where.listingId
          && dayKey(s.expectedOn as Date) === dayKey(where.expectedOn as Date)
          && (where.status as { in: string[] }).in.includes(s.status as string)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `S${settlements.length + 1}`, grossInr: 0, feeInr: 0, taxInr: 0, adjustInr: 0, netInr: 0, ...data };
        settlements.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, { increment?: number; decrement?: number }> }) => {
        const row = settlements.find((s) => s.id === where.id);
        if (row) {
          for (const [k, v] of Object.entries(data)) {
            if (v.increment) row[k] = (row[k] as number) + v.increment;
            if (v.decrement) row[k] = (row[k] as number) - v.decrement;
          }
        }
        return row;
      },
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [...settlements],
      count: async () => settlements.length,
    },
    settlementItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => { settlementItems.push(data); return data; },
      findMany: async () => [...settlementItems],
    },
    merchantAccount: {
      findUnique: async () => (opts.payoutsEnabled
        ? { listingId: 'L1', payoutsEnabled: true, providerAccountRef: 'fa_1', accountLast4: '4821' }
        : null),
    },
    serviceListing: { findUnique: async () => ({ id: 'L1', ownerId: 'OWNER', businessName: 'ABC Salon', slug: null, categoryKey: 'salons' }) },
    serviceEnquiry: {
      findUnique: async () => ({ id: 'E1', revealName: true }),
      update: async () => ({}),
    },
    serviceMessage: { create: async ({ data }: { data: Record<string, unknown> }) => { threadLines.push(data); return data; } },
    user: { findUnique: async () => ({ name: 'A neighbour' }) },
  };

  const clock = { now: () => T0 } as never;
  const notifications = {
    create: async (n: Record<string, unknown>) => { notes.push(n); },
  } as never;

  // The real FinancialService — its conditional decrement is the thing under
  // test as much as anything here, so it is not stubbed.
  const financial = Object.create(
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    (require('../financial/financial.service') as { FinancialService: { prototype: object } }).FinancialService.prototype,
  ) as { prisma: unknown };
  financial.prisma = prisma;

  const invoices = Object.create(
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    (require('./invoices.service') as { InvoicesService: { prototype: object } }).InvoicesService.prototype,
  ) as Record<string, unknown>;
  invoices.prisma = prisma; invoices.clock = clock; invoices.notifications = notifications;

  const settlement = Object.create(SettlementService.prototype) as Record<string, unknown>;
  settlement.prisma = prisma; settlement.clock = clock; settlement.notifications = notifications;
  settlement.payouts = new SandboxPayoutProvider();

  const provider = new SandboxPaymentProvider();
  const payments = Object.create(PaymentsService.prototype) as Record<string, unknown>;
  payments.prisma = prisma; payments.clock = clock; payments.financial = financial;
  payments.invoices = invoices; payments.settlement = settlement;
  payments.notifications = notifications; payments.provider = provider;

  return {
    payments: payments as unknown as PaymentsService,
    settlement: settlement as unknown as SettlementService,
    invoice, intents, ledger, settlements, settlementItems, walletTxns, notes, threadLines,
    balance: () => balanceInr,
  };
}

describe('paying an invoice from a wallet and a card at once', () => {
  it('takes ₹2,350 from the wallet and ₹2,500 from the card', async () => {
    const h = harness({ balanceInr: 2_350 });
    const out = await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }, 'k1');

    expect(out.paid).toBe(true);
    expect(out.payment.walletInr).toBe(2_350);
    expect(out.payment.cardInr).toBe(2_500);
    expect(h.balance()).toBe(0);
    expect(h.invoice.paidInr).toBe(4_850);
    expect(h.invoice.paidAt).not.toBeNull();
  });

  it('gives the citizen a reference they can read down a phone', async () => {
    const h = harness();
    const out = await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true });
    expect(out.payment.transactionRef).toMatch(/^TCX.•••••?.{0,2}$|^TCX.•{4}.{2}$/);
    expect(out.payment.transactionRef).toContain('TCX');
  });

  it('pays the whole thing from the wallet when it covers it', async () => {
    const h = harness({ balanceInr: 10_000 });
    const out = await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true });
    expect(out.payment.walletInr).toBe(4_850);
    expect(out.payment.cardInr).toBe(0);
    expect(h.balance()).toBe(5_150);
  });

  it('pays the whole thing by card when the citizen turns the wallet off', async () => {
    const h = harness({ balanceInr: 10_000 });
    const out = await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: false });
    expect(out.payment.cardInr).toBe(4_850);
    expect(h.balance()).toBe(10_000);
  });
});

describe('when the card says no', () => {
  /**
   * THE ONE THAT COSTS MONEY IF IT IS WRONG. A declined card after the wallet
   * leg has been taken must leave the citizen's balance exactly as it was —
   * and it must leave the invoice unpaid, because nothing was received.
   */
  it('puts the wallet leg back and leaves the invoice unpaid', async () => {
    const h = harness({ balanceInr: 2_350, card: 'decline' });
    await expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(h.balance()).toBe(2_350);
    expect(h.invoice.paidInr).toBe(0);
    expect(h.invoice.paidAt).toBeNull();
    expect(h.intents[0].status).toBe('failed');
  });

  it('writes the reversal as its own ledger line rather than hiding the round trip', async () => {
    const h = harness({ balanceInr: 2_350, card: 'decline' });
    await expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true })).rejects.toThrow();
    expect(h.walletTxns.map((t) => t.kind)).toEqual(['payment', 'refund']);
  });

  it('says nothing was taken when the processor does not answer', async () => {
    const h = harness({ balanceInr: 2_350, card: 'timeout' });
    await expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }))
      .rejects.toThrow(/did not answer/);
    expect(h.balance()).toBe(2_350);
  });

  it('banks nothing for the business when the payment failed', async () => {
    const h = harness({ card: 'decline' });
    await expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true })).rejects.toThrow();
    expect(h.ledger).toEqual([]);
    expect(h.settlements).toEqual([]);
  });
});

describe('paying twice', () => {
  it('charges once when the same key arrives again', async () => {
    const h = harness({ balanceInr: 10_000 });
    const first = await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }, 'same-key');
    const second = await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }, 'same-key');

    expect(second.replayed).toBe(true);
    expect(second.payment.id).toBe(first.payment.id);
    expect(h.intents).toHaveLength(1);
    expect(h.balance()).toBe(5_150);
  });

  it('refuses a second payment on an invoice that is already settled', async () => {
    const h = harness({ balanceInr: 10_000 });
    await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }, 'a');
    await expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }, 'b'))
      .rejects.toThrow(/already paid/);
  });
});

describe('what a citizen is not allowed to pay', () => {
  it('refuses an invoice whose total changed while the sheet was open', async () => {
    const h = harness();
    await expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_000, useWallet: true }))
      .rejects.toThrow(/now comes to/);
  });

  it('refuses a cancelled invoice', async () => {
    const h = harness();
    h.invoice.cancelledAt = T0;
    await expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }))
      .rejects.toThrow(/cancelled/);
  });

  it('refuses somebody else’s invoice without confirming it exists', async () => {
    const h = harness();
    await expect(h.payments.pay('A-STRANGER', 'I1', { expectInr: 4_850, useWallet: true }))
      .rejects.toThrow(/not found/);
  });
});

describe('what the business is owed', () => {
  it('opens a payout for the next working day and shows its working', async () => {
    const h = harness({ balanceInr: 10_000, payoutsEnabled: true });
    await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true });

    const money = feeFor(4_850);
    const batch = h.settlements[0];
    expect(batch.status).toBe('pending');
    expect(dayKey(batch.expectedOn as Date)).toBe(dayKey(nextBusinessDay(T0)));
    expect(batch.grossInr).toBe(4_850);
    expect(batch.netInr).toBe(money.netInr);
    expect((batch.grossInr as number) - (batch.feeInr as number) - (batch.taxInr as number)).toBe(batch.netInr);
  });

  it('books the sale, the fee and the tax as three lines, not one net line', async () => {
    const h = harness({ balanceInr: 10_000, payoutsEnabled: true });
    await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true });
    expect(h.ledger.map((e) => e.kind)).toEqual(['sale', 'fee', 'tax']);
    expect(h.ledger.reduce((s, e) => s + (e.amountInr as number), 0)).toBe(feeFor(4_850).netInr);
  });

  /**
   * §19: no unrestricted payouts before verification. The money is still the
   * business's — it accrues exactly as it would — but the batch it lands in
   * cannot leave.
   */
  it('holds the payout when the business has not finished verifying', async () => {
    const h = harness({ balanceInr: 10_000, payoutsEnabled: false });
    await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true });
    expect(h.settlements[0].status).toBe('on_hold');
    expect(h.settlements[0].netInr).toBe(feeFor(4_850).netInr);
  });

  it('tells the business it was paid, and the citizen the payment worked', async () => {
    const h = harness({ balanceInr: 10_000, payoutsEnabled: true });
    await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true });
    const kinds = h.notes.map((n) => n.kind);
    expect(kinds).toContain('invoice_paid');
    expect(kinds).toContain('invoice_paid_business');
    // §21: the merchant's settlement date is on the merchant's notification and
    // nowhere near the citizen's.
    const mine = h.notes.find((n) => n.kind === 'invoice_paid');
    expect(JSON.stringify(mine)).not.toMatch(/settlement/i);
  });

  it('leaves a receipt in the thread the invoice arrived in', async () => {
    const h = harness({ balanceInr: 10_000 });
    await h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true });
    expect(h.threadLines).toHaveLength(1);
    expect(h.threadLines[0].body).toMatch(/Paid ₹4,850/);
    expect(h.threadLines[0].senderSide).toBe('seeker');
  });
});

/**
 * ── THE SANDBOX DOES NOT RUN IN PRODUCTION (launch blocker 2, 2 Sep) ─────────
 *
 * Everything above proves the till adds up. This proves it is CLOSED where it
 * has no processor behind it: with NODE_ENV=production and PAYMENTS_SANDBOX
 * unset, a card leg is refused before an intent is written or a wallet leg
 * taken, the sandbox classes refuse on their own, and the quote says so —
 * while a wallet-only payment, which is real money in a real ledger, still
 * goes through. PAYMENTS_SANDBOX=on reopens it, for a staging deploy.
 */
describe('the sandbox in production', () => {
  const inProduction = async <T>(fn: () => Promise<T>, sandbox?: 'on'): Promise<T> => {
    const saved = { NODE_ENV: process.env.NODE_ENV, PAYMENTS_SANDBOX: process.env.PAYMENTS_SANDBOX };
    process.env.NODE_ENV = 'production';
    if (sandbox) process.env.PAYMENTS_SANDBOX = sandbox; else delete process.env.PAYMENTS_SANDBOX;
    try { return await fn(); } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.PAYMENTS_SANDBOX === undefined) delete process.env.PAYMENTS_SANDBOX; else process.env.PAYMENTS_SANDBOX = saved.PAYMENTS_SANDBOX;
    }
  };

  it('refuses a card leg before anything is written, and the wallet is untouched', async () => {
    const h = harness({ balanceInr: 2_350 });
    await inProduction(() =>
      expect(h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }, 'k1')).rejects.toBeInstanceOf(ForbiddenException));
    expect(h.intents).toHaveLength(0);
    expect(h.walletTxns).toHaveLength(0);
    expect(h.balance()).toBe(2_350);
    expect(h.invoice.paidInr).toBe(0);
  });

  it('still pays from the wallet alone — that is real money in a real ledger', async () => {
    const h = harness({ balanceInr: 10_000 });
    const out = await inProduction(() => h.payments.pay('CITIZEN', 'I1', { expectInr: 4_850, useWallet: true }, 'k1'));
    expect(out.paid).toBe(true);
    expect(out.payment.cardInr).toBe(0);
    expect(h.balance()).toBe(5_150);
  });

  it('tells the sheet in the quote, so no card button is drawn', async () => {
    const h = harness({ balanceInr: 2_350 });
    expect((await h.payments.quote('CITIZEN', 'I1', true)).cardAvailable).toBe(true);
    expect((await inProduction(() => h.payments.quote('CITIZEN', 'I1', true))).cardAvailable).toBe(false);
    expect((await inProduction(() => h.payments.quote('CITIZEN', 'I1', true), 'on')).cardAvailable).toBe(true);
  });

  it('the sandbox classes refuse on their own, so a new caller cannot route around the door', async () => {
    const pay = new SandboxPaymentProvider();
    const out = new SandboxPayoutProvider();
    await inProduction(async () => {
      await expect(pay.charge({ amountInr: 100, instrumentRef: 'visa:4242:x', reference: 'r', idempotencyKey: 'a' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(out.registerAccount({ accountNumber: '123456789', ifsc: 'HDFC0001234', holderName: 'x' } as never)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(out.transfer({ amountInr: 100, accountRef: 'fa_1', reference: 'r', idempotencyKey: 'b' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    });
    // And open again with the variable, for a staging deploy.
    const ok = await inProduction(() => pay.charge({ amountInr: 100, instrumentRef: 'visa:4242:x', reference: 'r', idempotencyKey: 'c' }), 'on');
    expect(ok.status).toBe('succeeded');
  });

  it('is on the kill-switch list under its own key', () => {
    const flag = FLAGS.find((f) => f.key === 'pay');
    expect(flag?.prefixes).toEqual(['pay']);
  });
});

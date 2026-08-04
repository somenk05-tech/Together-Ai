import { FinancialService, isUniqueViolation } from './financial.service';

/**
 * TWO TAPS ON "ADD ₹500" CREDITED ₹1,000.
 *
 * A charge has been safe since the conditional decrement landed: the balance
 * sits in the WHERE, so a second charge matches no rows and takes nothing.
 * `wallet-race.spec.ts` next door is that story. A TOP-UP had no such guard —
 * it was two statements outside a transaction, so a retry ran both again and a
 * failure between them left a ledger row claiming money that never arrived.
 *
 * Retries are not an edge case. A double tap on a slow connection is one, and a
 * PSP webhook is worse: every processor delivers at least once and therefore
 * sometimes twice. The audit asks for this BEFORE a processor is wired, which
 * is the only point at which it is cheap.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const P2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

function build(opts: { seen?: Set<string>; balance?: number } = {}) {
  const seen = opts.seen ?? new Set<string>();
  let balance = opts.balance ?? 0;
  const txns: any[] = [];
  let transactions = 0;
  let insertedBeforeThrow = 0;

  const inner = {
    walletTxn: {
      create: async ({ data }: any) => {
        // What the unique index does, in the only place a fake can do it.
        const key = data.idempotencyKey ? `${data.userId}|${data.idempotencyKey}` : null;
        if (key && seen.has(key)) throw P2002;
        if (key) seen.add(key);
        insertedBeforeThrow++;
        txns.push(data);
        return data;
      },
    },
    cityWallet: {
      update: async ({ data }: any) => {
        balance += data.balanceInr.increment as number;
        return { balanceInr: balance };
      },
      findUnique: async () => ({ balanceInr: balance }),
    },
  };

  const svc: any = Object.create(FinancialService.prototype);
  svc.ensureWallet = async () => ({ balanceInr: balance });
  svc.prisma = {
    ...inner,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactions++;
      const before = { balance, count: txns.length };
      try {
        return await fn(inner);
      } catch (e) {
        // A real transaction rolls back. The fake has to, or it proves nothing.
        balance = before.balance;
        txns.length = before.count;
        throw e;
      }
    },
  };
  return { svc, txns: () => txns, balance: () => balance, transactions: () => transactions, seen,
    inserted: () => insertedBeforeThrow };
}

describe('a top-up credits once', () => {
  it('credits the money and records it', async () => {
    const h = build();
    expect(await h.svc.topUp('u1', 500, 'k-1')).toEqual({ balanceInr: 500 });
    expect(h.txns()).toHaveLength(1);
    expect(h.txns()[0]).toMatchObject({ kind: 'topup', amountInr: 500, idempotencyKey: 'k-1' });
  });

  it('does nothing the second time the SAME attempt arrives', async () => {
    const h = build();
    await h.svc.topUp('u1', 500, 'k-1');
    const again = await h.svc.topUp('u1', 500, 'k-1');
    expect(again).toEqual({ balanceInr: 500, replayed: true });
    expect(h.balance()).toBe(500);
    expect(h.txns()).toHaveLength(1);
  });

  it('answers a replay with the balance rather than an error', async () => {
    // The caller is a client that already believes it topped up. Telling it
    // "duplicate" invites a retry loop; telling it the balance is the truth it
    // was asking for.
    const h = build();
    await h.svc.topUp('u1', 500, 'k-1');
    await expect(h.svc.topUp('u1', 500, 'k-1')).resolves.toBeTruthy();
  });

  it('still credits a genuinely different top-up', async () => {
    const h = build();
    await h.svc.topUp('u1', 500, 'k-1');
    await h.svc.topUp('u1', 300, 'k-2');
    expect(h.balance()).toBe(800);
    expect(h.txns()).toHaveLength(2);
  });

  it('does not let one citizen\'s key block another\'s', async () => {
    const h = build();
    await h.svc.topUp('u1', 500, 'same');
    await h.svc.topUp('u2', 500, 'same');
    expect(h.txns()).toHaveLength(2);
  });

  it('still works for a caller that sends no key at all', async () => {
    // NULLs are distinct in a unique index, so unkeyed top-ups do not collide
    // with each other. They get no protection — which is what they had before.
    const h = build();
    await h.svc.topUp('u1', 500);
    await h.svc.topUp('u1', 500);
    expect(h.balance()).toBe(1000);
    expect(h.txns()[0].idempotencyKey).toBeNull();
  });

  it('treats a blank or whitespace key as no key', async () => {
    const h = build();
    await h.svc.topUp('u1', 100, '   ');
    expect(h.txns()[0].idempotencyKey).toBeNull();
  });

  it('bounds the key, so a megabyte header cannot be stored', async () => {
    const h = build();
    await h.svc.topUp('u1', 100, 'x'.repeat(5000));
    expect(String(h.txns()[0].idempotencyKey)).toHaveLength(120);
  });
});

describe('the ledger row and the balance move together', () => {
  it('does both inside one transaction', async () => {
    const h = build();
    await h.svc.topUp('u1', 500, 'k-1');
    expect(h.transactions()).toBe(1);
  });

  it('leaves no ledger row behind when the balance cannot move', async () => {
    // The old shape wrote the row first, outside a transaction. A failure here
    // left a ledger claiming ₹500 arrived and a balance that never moved —
    // and reconciliation would report a discrepancy nobody could act on,
    // because the money was never real.
    const h = build();
    (h.svc.prisma.cityWallet as any).update = async () => { throw new Error('db down'); };
    await expect(h.svc.topUp('u1', 500, 'k-1')).rejects.toThrow('db down');
    expect(h.txns()).toHaveLength(0);
    expect(h.balance()).toBe(0);
  });

  it('does not swallow a real database failure as a replay', async () => {
    const h = build();
    (h.svc.prisma.cityWallet as any).update = async () => { throw new Error('db down'); };
    await expect(h.svc.topUp('u1', 500, 'k-1')).rejects.toThrow('db down');
  });
});

describe('isUniqueViolation', () => {
  it('recognises P2002 without importing Prisma\'s error class', () => {
    // Reading the code off an `unknown` keeps this true when the generated
    // client is regenerated, and keeps these tests free of a real client.
    expect(isUniqueViolation(P2002)).toBe(true);
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('is not fooled by anything else', () => {
    for (const e of [null, undefined, new Error('nope'), { code: 'P2025' }, 'P2002', 42]) {
      expect(isUniqueViolation(e)).toBe(false);
    }
  });
});

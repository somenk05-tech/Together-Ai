import { BadRequestException } from '@nestjs/common';
import { FinancialService } from './financial.service';

/**
 * The wallet cannot be spent twice.
 *
 * There is no database here, so this cannot prove the SQL is atomic — that is
 * Postgres's job and the WHERE clause is how it is asked. What it does prove is
 * the thing the code has to get right either way: that the RESULT of the
 * conditional deduction is what authorises the payment, and not the balance
 * read a few lines earlier. The old version read, compared, and then decremented
 * unconditionally, so a `count` of 0 could not have failed it — there was no
 * count to look at.
 */
type Wallet = { userId: string; balanceInr: number; cardLast4: string | null; cardBrand?: string | null; cardName?: string | null };

/**
 * `onDeduct` fires between the read and the write, which is exactly the window
 * a second payment lands in.
 */
function stub(wallet: Wallet, onDeduct?: () => void) {
  const txns: unknown[] = [];
  const db = {
    cityWallet: {
      upsert: async () => ({ ...wallet }),
      findUnique: async () => ({ balanceInr: wallet.balanceInr }),
      updateMany: async ({ where, data }: any) => {
        onDeduct?.();
        const gte = where?.balanceInr?.gte;
        if (typeof gte === 'number' && wallet.balanceInr < gte) return { count: 0 };
        wallet.balanceInr -= data.balanceInr.decrement;
        return { count: 1 };
      },
    },
    walletTxn: { create: async ({ data }: any) => { txns.push(data); return data; } },
  } as any;
  const prisma = { ...db, $transaction: async (fn: any) => fn(db) } as any;
  return { prisma, txns, wallet };
}

const charge = (amountInr: number) => ({ hub: 'Travel', category: 'travel', label: 'Flight', amountInr });

describe('the city wallet', () => {
  it('pays when the balance covers it', async () => {
    const { prisma, txns, wallet } = stub({ userId: 'u', balanceInr: 500, cardLast4: null });
    const out = await new FinancialService(prisma).charge('u', charge(500));
    expect(out).toMatchObject({ paid: true, method: 'wallet' });
    expect(wallet.balanceInr).toBe(0);
    expect(txns).toHaveLength(1);
  });

  it('refuses, with the shortfall, when it plainly does not', async () => {
    const { prisma, txns } = stub({ userId: 'u', balanceInr: 420, cardLast4: null });
    await expect(new FinancialService(prisma).charge('u', charge(500)))
      .rejects.toThrow(/Top up ₹80 more/);
    expect(txns).toHaveLength(0);
  });

  it('refuses a payment overtaken between the check and the deduction', async () => {
    // The balance covers ₹500 when it is read. Another payment takes it first.
    const s = stub({ userId: 'u', balanceInr: 500, cardLast4: null }, () => { s.wallet.balanceInr = 0; });
    await expect(new FinancialService(s.prisma).charge('u', charge(500)))
      .rejects.toBeInstanceOf(BadRequestException);
    // Nothing taken, and no ledger row claiming otherwise.
    expect(s.wallet.balanceInr).toBe(0);
    expect(s.txns).toHaveLength(0);
  });

  it('never writes a payment row for money it did not get', async () => {
    const s = stub({ userId: 'u', balanceInr: 500, cardLast4: null }, () => { s.wallet.balanceInr = 100; });
    await expect(new FinancialService(s.prisma).charge('u', charge(500))).rejects.toThrow();
    expect(s.txns).toEqual([]);
    expect(s.wallet.balanceInr).toBe(100);   // the other payment's ₹400 stands; ours took nothing
  });

  it('a card payment does not touch the balance at all', async () => {
    const { prisma, txns, wallet } = stub({ userId: 'u', balanceInr: 10, cardLast4: '4242' });
    const out = await new FinancialService(prisma).charge('u', { ...charge(9999), method: 'card' });
    expect(out).toMatchObject({ paid: true, method: 'card' });
    expect(wallet.balanceInr).toBe(10);
    expect(txns).toHaveLength(1);
  });

  it('refuses a card payment when no card is linked', async () => {
    const { prisma } = stub({ userId: 'u', balanceInr: 9999, cardLast4: null });
    await expect(new FinancialService(prisma).charge('u', { ...charge(10), method: 'card' }))
      .rejects.toThrow(/No card linked/);
  });
});

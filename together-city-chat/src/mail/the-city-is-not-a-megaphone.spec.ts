import { MailService } from './mail.service';

/**
 * WRITING TO A CITIZEN NEEDED A CONNECTION. WRITING TO THE WORLD NEEDED
 * NOTHING.
 *
 * `sendOne`'s external branch returns before the connection check, `cc` and
 * `bcc` take 25 each, and every dispatch leaves From a DKIM-aligned
 * <handle>@togethercity.app that passes DMARC. One API call was 51
 * separately-addressed emails to arbitrary strangers, and the only ceiling was
 * a global 120-requests-a-minute throttler that counts requests, not
 * recipients.
 *
 * What it costs is not this account. Password recovery and security notices
 * leave on the SAME verified domain, so a burnt sender reputation locks
 * everybody out of their own accounts.
 *
 * The budget is externals only: mail to citizens is already gated by the
 * connection rule, and counting it here would make the cap bite the people it
 * is not for.
 *
 * CHECKED AGAINST THE OLD CODE. With both checks removed, the first four
 * assertions below fail.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function harness(spentToday = 0) {
  const rows: any[] = [];
  const dispatched: string[] = [];
  let seq = 0;
  const create = async ({ data }: any) => {
    const row = { id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), threadId: null, projectId: null, ccAddrs: null, bccAddrs: null, ...data };
    rows.push(row); return row;
  };
  const prisma: any = {
    mailMessage: {
      create,
      // The daily city-mail ceiling counts the sender's own Sent rows.
      // Added 29 Aug: internal mail had no limit at all, and the row it
      // writes is charged against the RECIPIENT'S quota.
      count: async () => 0,
      findFirst: async () => null,
      findMany: async ({ select }: any) => (select?.sizeBytes ? [] : []),
      // Nothing is ever stored here, so the mailbox weighs nothing.
      aggregate: async () => ({ _sum: { sizeBytes: 0 } }),
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
    },
    mailProject: { findFirst: async () => null },
    mailAccount: { findUnique: async () => ({ userId: 'u1', address: 'somen@togethercity.app' }) },
    emailDelivery: { count: async () => spentToday, create: async () => undefined },
    user: {
      findUnique: async ({ where }: any) => {
        // emailVerified since 29 Aug: writing OUTSIDE the city now requires the
        // sender to have confirmed their own address. Internal mail is unaffected.
        if (where.id) return { id: 'u1', name: 'Somen', handle: 'somen', emailVerified: true };
        const known: any = { alice: { id: 'u2', name: 'Alice', handle: 'alice' } };
        return known[where.handle] ?? null;
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  svc.isConnected = async () => true;
  svc.linkAttachments = async () => undefined;
  svc.clearDraft = async () => undefined;
  svc.usedBytes = async () => 0;
  // Stand in for the whole provider hop: record the address and write nothing.
  svc.sendExternal = async (_u: string, _f: string, _n: string, to: string) => {
    dispatched.push(to); return [];
  };
  prisma.mailMessage.create = create;
  return { svc, rows, dispatched };
}

const externals = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@example.com`);

describe('how many strangers one message may reach', () => {
  it('refuses a message naming more than ten addresses outside the city', async () => {
    const { svc, dispatched } = harness();
    await expect(svc.send('u1', {
      to: 'first@example.com', cc: externals(10), subject: 'buy', body: 'x',
    })).rejects.toThrow(/10 addresses outside the city/);
    // Refused before anything left the building, not after five of them had.
    expect(dispatched).toHaveLength(0);
  });

  it('allows exactly ten', async () => {
    const { svc, dispatched } = harness();
    await svc.send('u1', { to: 'first@example.com', cc: externals(9), subject: 'hi', body: 'x' });
    expect(dispatched).toHaveLength(10);
  });

  it('does not count citizens towards it', async () => {
    const { svc, dispatched } = harness();
    // Ten externals AND a citizen: the citizen is gated by the connection
    // rule, so counting them here would penalise the ordinary case.
    await svc.send('u1', {
      to: 'alice@togethercity.app', cc: externals(10), subject: 'hi', body: 'x',
    });
    expect(dispatched).toHaveLength(10);
  });
});

describe('how many strangers one citizen may reach in a day', () => {
  it('refuses once the rolling 24 hours is spent', async () => {
    const { svc, dispatched } = harness(199);
    await expect(svc.send('u1', {
      to: 'a@example.com', cc: ['b@example.com'], subject: 'hi', body: 'x',
    })).rejects.toThrow(/daily limit of 200/);
    expect(dispatched).toHaveLength(0);
  });

  it('lets the last one of the budget through', async () => {
    const { svc, dispatched } = harness(199);
    await svc.send('u1', { to: 'a@example.com', subject: 'hi', body: 'x' });
    expect(dispatched).toEqual(['a@example.com']);
  });

  it('never asks the question for a message that stays inside the city', async () => {
    // A spent budget must not stop a citizen writing to a citizen.
    const { svc } = harness(100000);
    const res = await svc.send('u1', { to: 'alice@togethercity.app', subject: 'hi', body: 'x' });
    expect(res.delivered).toEqual(['alice@togethercity.app']);
  });
});

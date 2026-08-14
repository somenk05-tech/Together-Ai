import { MailService } from './mail.service';

/**
 * THE INBOUND WEBHOOK IS UNTRUSTED INPUT, AND WAS READ AS IF IT WERE NOT.
 *
 * Three separate things were true of `ingestInbound` at once:
 *
 *  1. `fromAddr` was written straight off the wire. Mail between citizens
 *     never leaves the building, so an arriving message whose From is a city
 *     address did not come from that citizen — but it rendered as internal
 *     mail, and `resolveInboundThread` matched it into a real conversation by
 *     sender and subject.
 *  2. `providerMessageId` was written and never read. Every provider retry —
 *     a timeout on our side, an at-least-once guarantee doing its job — put
 *     another copy of the same email in the same inbox.
 *  3. The delivery loop had no catch, so one failed write escaped the method,
 *     Nest answered 500, and the provider re-sent the whole payload to the
 *     mailboxes that had already taken it.
 *
 * Nothing in the mail suites reached any of it: `mail-inbound.spec.ts` tests
 * the pure parsers in `mail-inbound.ts` and never calls the service.
 *
 * CHECKED AGAINST THE OLD CODE. With the gate, the dedupe and the catch
 * reverted, the first six assertions below fail.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function harness(opts: { failFor?: string } = {}) {
  const rows: any[] = [];
  const warned: string[] = [];
  let seq = 0;
  const prisma: any = {
    mailMessage: {
      create: async ({ data }: any) => {
        if (opts.failFor && data.toAddr.startsWith(opts.failFor)) throw new Error('write refused');
        const row = { id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), ...data };
        rows.push(row); return row;
      },
      findFirst: async ({ where }: any) => rows.find((r) =>
        (!where.ownerId || r.ownerId === where.ownerId)
        && (!where.providerMessageId || r.providerMessageId === where.providerMessageId)) ?? null,
    },
    user: {
      findUnique: async ({ where }: any) => {
        const known: any = {
          alice: { id: 'u2', name: 'Alice', deletedAt: null },
          bob: { id: 'u3', name: 'Bob', deletedAt: null },
          somen: { id: 'u1', name: 'Somen', deletedAt: null },
        };
        // Sixty mailboxes for the cap test: h0 … h59.
        if (/^h\d+$/.test(where.handle)) return { id: `x${where.handle}`, name: where.handle, deletedAt: null };
        return known[where.handle] ?? null;
      },
    },
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.logger = { warn: (m: string) => warned.push(m), error: (m: string) => warned.push(m), log: () => undefined };
  svc.ensureAccount = async () => ({ address: 'x@togethercity.app' });
  svc.inboundBody = async () => 'the body';
  svc.usedBytes = async () => 0;
  svc.resolveInboundThread = async () => 'thread-1';
  svc.threadProject = async () => null;
  svc.subAddressProject = async () => null;
  svc.fileWholeThread = async () => undefined;
  return { svc, rows, warned };
}

const payload = (over: any = {}) => ({
  type: 'email.received',
  data: {
    to: ['alice@togethercity.app'],
    from: 'Someone <someone@example.com>',
    subject: 'hello',
    text: 'hi',
    message_id: '<abc@example.com>',
    ...over,
  },
});

describe('an arriving message may not claim to be from a citizen', () => {
  it('refuses a From on the city domain and writes nothing', async () => {
    const { svc, rows } = harness();
    const res = await svc.ingestInbound(payload({ from: '"The Mayor" <mayor@togethercity.app>' }));
    expect(res).toEqual({ ok: false, reason: 'from-is-a-city-address' });
    expect(rows).toHaveLength(0);
  });

  it('refuses a From on a legacy city domain too', async () => {
    const { svc, rows } = harness();
    const res = await svc.ingestInbound(payload({ from: 'old@togethercity.tech' }));
    expect(res.ok).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it('says so in the log rather than dropping it quietly', async () => {
    const { svc, warned } = harness();
    await svc.ingestInbound(payload({ from: 'mayor@togethercity.app' }));
    expect(warned.join(' ')).toContain('mayor@togethercity.app');
  });

  it('still delivers ordinary external mail', async () => {
    const { svc, rows } = harness();
    const res = await svc.ingestInbound(payload());
    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(1);
    expect(rows[0].fromAddr).toBe('someone@example.com');
  });
});

describe('a provider retry is not a second email', () => {
  it('delivers once however often the same message id arrives', async () => {
    const { svc, rows } = harness();
    await svc.ingestInbound(payload());
    const again = await svc.ingestInbound(payload());
    expect(rows).toHaveLength(1);
    expect(again.delivered).toBe(0);
  });

  it('still delivers a genuinely different message from the same sender', async () => {
    const { svc, rows } = harness();
    await svc.ingestInbound(payload());
    await svc.ingestInbound(payload({ message_id: '<def@example.com>', subject: 'another' }));
    expect(rows).toHaveLength(2);
  });
});

describe('one mailbox failing does not undo the others', () => {
  it('keeps the deliveries that worked and reports the one that did not', async () => {
    const { svc, rows } = harness({ failFor: 'bob@' });
    const res = await svc.ingestInbound(payload({
      to: ['alice@togethercity.app', 'bob@togethercity.app'],
    }));
    // Before the catch this threw, Nest answered 500, and the provider re-sent
    // the payload to Alice — who already had it.
    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(1);
    expect(res.errors).toBe(1);
    expect(rows.map((r) => r.ownerId)).toEqual(['u2']);
  });
});

describe('one email may not address the whole city', () => {
  it('caps the fan-out and says how many it dropped', async () => {
    const { svc, rows, warned } = harness();
    const to = Array.from({ length: 60 }, (_, i) => `h${i}@togethercity.app`);
    const res = await svc.ingestInbound(payload({ to }));
    expect(res.delivered).toBe(50);
    expect(rows).toHaveLength(50);
    expect(warned.join(' ')).toContain('60 city recipients');
  });
});

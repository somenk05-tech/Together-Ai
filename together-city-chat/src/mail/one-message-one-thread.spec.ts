import { MailService } from './mail.service';

/**
 * ONE MESSAGE IS ONE MESSAGE, however many people it goes to.
 *
 * `fanOut` calls `sendOne` once per address, and `sendOne` used to resolve the
 * thread itself — so for a NEW message, where `dto.threadId` is undefined,
 * every recipient got a fresh uuid. Three recipients, three unrelated
 * conversations, from one press of Send. The damage was not cosmetic:
 *
 *  · attachments are linked to a THREAD and `attachedId` is one column, so the
 *    last recipient's trail won and the sender's own Sent copy showed a
 *    message whose files 404;
 *  · a reply arrived in a trail the sender's copy was not in, with no original
 *    beside it.
 *
 * And `keepSentCopy` — in `sendExternal`'s parameter type since fanOut was
 * written — was never read there, so the external path kept one Sent row per
 * recipient while the internal path kept one per message.
 *
 * None of the existing mail suites could see any of this: they send to one
 * person. That is why this file sends to more than one.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function harness() {
  const rows: any[] = [];
  let seq = 0;
  const matches = (where: any, r: any): boolean => {
    if (where.id && where.id !== r.id) return false;
    if (where.ownerId && where.ownerId !== r.ownerId) return false;
    if (where.threadId !== undefined && where.threadId !== r.threadId) return false;
    if (typeof where.folder === 'string' && where.folder !== r.folder) return false;
    if (where.folder?.in && !where.folder.in.includes(r.folder)) return false;
    if (where.NOT?.folder && where.NOT.folder === r.folder) return false;
    if (where.projectId?.not === null && r.projectId == null) return false;
    return true;
  };
  const create = async ({ data }: any) => {
    const row = { id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), starred: false, threadId: null, projectId: null, ccAddrs: null, bccAddrs: null, failureReason: null, ...data };
    rows.push(row); return row;
  };
  const prisma: any = {
    mailMessage: {
      create,
      findFirst: async ({ where }: any) => rows.find((r) => matches(where, r)) ?? null,
      findMany: async ({ where, select }: any) => {
        const hit = rows.filter((r) => matches(where ?? {}, r));
        return select?.sizeBytes ? hit.map((r) => ({ sizeBytes: r.sizeBytes })) : hit;
      },
      deleteMany: async () => ({ count: 0 }),
    },
    mailProject: { findFirst: async () => null },
    mailAccount: { findUnique: async () => ({ userId: 'u1', address: 'somen@togethercity.app' }) },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) return { id: 'u1', name: 'Somen', handle: 'somen' };
        const known: any = { alice: { id: 'u2', name: 'Alice', handle: 'alice' }, bob: { id: 'u3', name: 'Bob', handle: 'bob' }, somen: { id: 'u1', name: 'Somen', handle: 'somen' } };
        return known[where.handle] ?? null;
      },
    },
    // The array form; every call in this path is a list of creates.
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  svc.isConnected = async () => true;
  svc.linkAttachments = async () => undefined;
  svc.clearDraft = async () => undefined;
  // $transaction returns the creates already applied above; Prisma's real
  // client defers them, so the stub applies them when the promise is built.
  prisma.mailMessage.create = create;
  return { svc, rows };
}

const sentRows = (rows: any[]) => rows.filter((r) => r.ownerId === 'u1' && r.folder === 'sent');
const inboxRows = (rows: any[]) => rows.filter((r) => r.folder === 'inbox');

describe('one message, one thread', () => {
  it('puts every recipient of a new message in the SAME trail', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', { to: 'alice@togethercity.app', cc: ['bob@togethercity.app'], subject: 'hi', body: 'x' });

    const threads = new Set(rows.map((r) => r.threadId));
    expect(threads.size).toBe(1);
    expect([...threads][0]).toEqual(expect.any(String));
  });

  it('keeps ONE Sent copy for the sender, not one per recipient', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', { to: 'alice@togethercity.app', cc: ['bob@togethercity.app'], subject: 'hi', body: 'x' });

    expect(sentRows(rows)).toHaveLength(1);
    // ...and both recipients still got theirs.
    expect(inboxRows(rows).map((r) => r.ownerId).sort()).toEqual(['u2', 'u3']);
  });

  it('carries the Cc list on every copy and the Bcc list on the sender’s alone', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', {
      to: 'alice@togethercity.app', cc: ['bob@togethercity.app'], bcc: ['carol@example.com'],
      subject: 'hi', body: 'x',
    });
    for (const r of inboxRows(rows)) {
      expect(r.ccAddrs).toContain('bob@togethercity.app');
      expect(r.bccAddrs ?? null).toBeNull();
    }
    expect(sentRows(rows)[0].bccAddrs).toContain('carol@example.com');
  });

  it('does not enqueue the sender’s own address as a second copy', async () => {
    // Cc yourself alongside somebody else and the second pass wrote NOTHING —
    // no Sent row (the first pass owns that) and no inbox row (the internal
    // path skips it when recipient is sender) — while still reporting the
    // address as delivered. A 200 for a copy that does not exist.
    const { svc, rows } = harness();
    const res = await svc.send('u1', {
      to: 'alice@togethercity.app', cc: ['somen@togethercity.app'], subject: 'hi', body: 'x',
    });
    expect(res.delivered).toEqual(['alice@togethercity.app']);
    expect(rows).toHaveLength(2); // one Sent, one inbox for Alice
  });

  it('still writes to yourself when you are the only recipient', async () => {
    const { svc, rows } = harness();
    const res = await svc.send('u1', { to: 'somen@togethercity.app', subject: 'note', body: 'x' });
    expect(res.delivered).toEqual(['somen@togethercity.app']);
    expect(sentRows(rows)).toHaveLength(1);
  });

  it('returns an object with the failures in it, not an array with fields bolted on', async () => {
    const { svc } = harness();
    const res = await svc.send('u1', { to: 'alice@togethercity.app', subject: 'hi', body: 'x' });
    expect(Array.isArray(res)).toBe(false);
    expect(Array.isArray(res.sent)).toBe(true);
    expect(res.failed).toEqual([]);
  });

  it('reports the refused address instead of swallowing it, when others succeed', async () => {
    const { svc } = harness();
    const res = await svc.send('u1', {
      to: 'alice@togethercity.app', cc: ['nobody@togethercity.app'], subject: 'hi', body: 'x',
    });
    expect(res.delivered).toEqual(['alice@togethercity.app']);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].to).toBe('nobody@togethercity.app');
  });
});

describe('what a message tells the client about its copies', () => {
  it('emits ccAddrs and bccAddrs, which were written and never returned', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', {
      to: 'alice@togethercity.app', cc: ['bob@togethercity.app'], bcc: ['carol@example.com'],
      subject: 'hi', body: 'x',
    });
    const shaped = svc.shape(sentRows(rows)[0]);
    expect(shaped.ccAddrs).toContain('bob@togethercity.app');
    expect(shaped.bccAddrs).toContain('carol@example.com');
  });
});

import { MailService } from './mail.service';

/**
 * A DELIVERED MESSAGE ALWAYS LEAVES A TRACE IN THE MAILBOX THAT SENT IT.
 *
 * `fanOut` wrote the sender's copy with `keepSentCopy: i === 0` — "the first
 * recipient carries the row". That is the same thing as "the first attempt that
 * writes one" only when the first recipient gets far enough to write. It does
 * not when the address is malformed, names no city mailbox, belongs to somebody
 * the sender is not connected with, or the mailbox is full: `sendOne` throws
 * before any create, and every later recipient then ran with the copy already
 * spoken for and wrote an inbox row and nothing else.
 *
 *   send({ to: <refused>, cc: [<accepted>] })
 *
 * The Cc'd citizen receives the mail. `send()` returns 200 with them in
 * `delivered`, so `clearDraft` removes the draft. The sender is left with no
 * Sent row, no Failed row and no draft: a message delivered, and no trace of
 * it anywhere in their own mailbox.
 *
 * This file sends to somebody who will be refused FIRST, which is the one
 * shape none of the other mail suites has: `one-message-one-thread.spec.ts`
 * exercises the reverse order only (`to` succeeds, `cc` fails), so its
 * guarantee never reached this.
 *
 * CHECKED AGAINST THE OLD CODE. With the ledger reverted to `i === 0`, the
 * first two assertions below fail and the rest pass.
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
    return true;
  };
  const create = async ({ data }: any) => {
    const row = {
      id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), starred: false,
      threadId: null, projectId: null, ccAddrs: null, bccAddrs: null, failureReason: null, ...data,
    };
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
      // usedBytes() adds the mailbox up in the DATABASE now instead of reading
      // every row into the process, so the stub needs the one method Prisma
      // uses to do that. It sums the same rows findMany would have returned.
      aggregate: async ({ where, _sum }: any) => ({
        _sum: _sum?.sizeBytes
          ? { sizeBytes: rows.filter((r) => matches(where ?? {}, r)).reduce((n: number, r: any) => n + (r.sizeBytes ?? 0), 0) }
          : {},
      }),
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
    },
    mailProject: { findFirst: async () => null },
    mailAccount: { findUnique: async () => ({ userId: 'u1', address: 'somen@togethercity.app' }) },
    // The outbound budget counts external dispatches out of this table.
    emailDelivery: { count: async () => 0 },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) return { id: 'u1', name: 'Somen', handle: 'somen' };
        // `stranger` exists but is not connected; `nobody` does not exist at
        // all. Both refuse BEFORE any row is written, which is the point.
        const known: any = {
          alice: { id: 'u2', name: 'Alice', handle: 'alice' },
          bob: { id: 'u3', name: 'Bob', handle: 'bob' },
          stranger: { id: 'u9', name: 'Stranger', handle: 'stranger' },
          somen: { id: 'u1', name: 'Somen', handle: 'somen' },
        };
        return known[where.handle] ?? null;
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  svc.isConnected = async (_me: string, other: string) => other !== 'u9';
  svc.linkAttachments = async () => undefined;
  svc.clearDraft = async () => undefined;
  prisma.mailMessage.create = create;
  return { svc, rows };
}

const sentRows = (rows: any[]) => rows.filter((r) => r.ownerId === 'u1' && r.folder === 'sent');
const inboxRows = (rows: any[]) => rows.filter((r) => r.folder === 'inbox');

describe('the sender keeps a copy of a message that was delivered', () => {
  it('writes the Sent row when the FIRST recipient was refused before any write', async () => {
    const { svc, rows } = harness();
    const res = await svc.send('u1', {
      to: 'stranger@togethercity.app', cc: ['alice@togethercity.app'], subject: 'hi', body: 'x',
    });

    expect(res.delivered).toEqual(['alice@togethercity.app']);
    expect(res.failed).toHaveLength(1);
    // Alice has it, and so does the sender. Neither used to be true together.
    expect(inboxRows(rows).map((r) => r.ownerId)).toEqual(['u2']);
    expect(sentRows(rows)).toHaveLength(1);
  });

  it('carries the blind list on that row, wherever in the queue it landed', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', {
      to: 'nobody@togethercity.app', cc: ['alice@togethercity.app'],
      bcc: ['carol@togethercity.app'], subject: 'hi', body: 'x',
    });
    // The Bcc list is the sender's alone and must travel with whichever row is
    // theirs — pinning it to the first recipient lost it with the first refusal.
    expect(sentRows(rows)[0].bccAddrs).toContain('carol@togethercity.app');
    for (const r of inboxRows(rows)) expect(r.bccAddrs ?? null).toBeNull();
  });

  it('still keeps exactly ONE Sent row when everybody is accepted', async () => {
    const { svc, rows } = harness();
    await svc.send('u1', {
      to: 'alice@togethercity.app', cc: ['bob@togethercity.app'], subject: 'hi', body: 'x',
    });
    expect(sentRows(rows)).toHaveLength(1);
    expect(inboxRows(rows).map((r) => r.ownerId).sort()).toEqual(['u2', 'u3']);
  });

  it('writes nothing at all when every recipient is refused', async () => {
    const { svc, rows } = harness();
    await expect(svc.send('u1', {
      to: 'stranger@togethercity.app', cc: ['nobody@togethercity.app'], subject: 'hi', body: 'x',
    })).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });
});

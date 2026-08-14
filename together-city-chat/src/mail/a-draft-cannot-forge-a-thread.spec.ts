import { MailService } from './mail.service';

/**
 * A DRAFT IS NOT A MEMBERSHIP CARD.
 *
 * Thread membership is this module's authorization boundary. `threadAttachments`
 * and `attachmentUrl` both accept "the caller owns a row in this thread" as
 * proof they belong in the conversation, and neither filters by folder — so a
 * DRAFT carrying somebody else's threadId was as good as a message in their
 * thread, and a draft costs nothing to make:
 *
 *   POST /mail/draft {"threadId": "<their thread>"}
 *   GET  /mail/thread/<their thread>/attachments/<file>/url   →  signed URL
 *
 * Two requests, no send, no connection with the victim, and a stranger has a
 * download link for another citizen's Drive file. `resolveThreadId` was written
 * to close exactly this and says so in its own comment; both send paths route
 * through it and `saveDraft` never did.
 *
 * THE HARNESS HERE IS ITS OWN, deliberately, and does not reuse the one in
 * mail-drafts.spec.ts: that one's `matches()` ignores `where.threadId`, so
 * every findFirst matches any row of the owner and this test would pass
 * whether or not the gate exists. A guard that cannot fail is not a guard.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function harness(rows: any[] = []) {
  let seq = 0;
  const matches = (where: any, r: any): boolean => {
    if (where.id && where.id !== r.id) return false;
    if (where.ownerId && where.ownerId !== r.ownerId) return false;
    // THE LINE THE OTHER HARNESS IS MISSING.
    if (where.threadId !== undefined && where.threadId !== r.threadId) return false;
    if (typeof where.folder === 'string' && where.folder !== r.folder) return false;
    return true;
  };
  const prisma: any = {
    mailMessage: {
      create: async ({ data }: any) => {
        const row = { id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), starred: false, threadId: null, failureReason: null, ...data };
        rows.push(row); return row;
      },
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
    },
    user: { findUnique: async () => ({ id: 'u1', name: 'Somen', handle: 'somen' }) },
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  return { svc, rows };
}

const VICTIM_THREAD = '11111111-2222-3333-4444-555555555555';

describe('a draft cannot forge membership of a thread', () => {
  it('refuses a threadId the writer holds no message in, and starts a fresh trail', async () => {
    // The victim's conversation exists — it just is not this citizen's.
    const { svc, rows } = harness([
      { id: 'victim1', ownerId: 'u2', folder: 'inbox', threadId: VICTIM_THREAD, sizeBytes: 10, body: '', subject: '' },
    ]);

    const d = await svc.saveDraft('u1', { to: '', subject: '', body: '', threadId: VICTIM_THREAD });

    // The claim is not honoured...
    expect(d.threadId).not.toBe(VICTIM_THREAD);
    // ...and it is nowhere on the stored row either.
    expect(rows.find((r: any) => r.ownerId === 'u1').threadId).not.toBe(VICTIM_THREAD);
    // The victim's own row is untouched.
    expect(rows.find((r: any) => r.id === 'victim1').threadId).toBe(VICTIM_THREAD);
  });

  it('saves the draft rather than throwing, because unfinished work is not the citizen’s fault', async () => {
    // A parameter they never chose must not cost them what they typed.
    const { svc } = harness([
      { id: 'victim1', ownerId: 'u2', folder: 'inbox', threadId: VICTIM_THREAD, sizeBytes: 10, body: '', subject: '' },
    ]);
    const d = await svc.saveDraft('u1', { to: 'a@b.com', subject: 'hello', body: 'half a sentence', threadId: VICTIM_THREAD });
    expect(d.body).toBe('half a sentence');
    expect(d.folder).toBe('draft');
    expect(typeof d.threadId).toBe('string');
  });

  it('keeps the thread when the writer really is in it — a reply-draft still replies', async () => {
    const MINE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const { svc } = harness([
      { id: 'mine1', ownerId: 'u1', folder: 'inbox', threadId: MINE, sizeBytes: 10, body: '', subject: '' },
    ]);
    const d = await svc.saveDraft('u1', { to: 'a@b.com', subject: 'Re: x', body: 'ok', threadId: MINE });
    expect(d.threadId).toBe(MINE);
  });

  it('leaves a draft with no thread alone', async () => {
    const { svc } = harness();
    const d = await svc.saveDraft('u1', { to: '', subject: '', body: '' });
    expect(d.threadId).toBeNull();
  });

  it('a draft of the writer’s own does not vouch for a second forged draft', async () => {
    // The obvious escalation: forge one draft, then use IT as the proof for
    // the next. resolveThreadId reads any row of the owner's, so this asserts
    // the first forgery never landed in the first place.
    const { svc, rows } = harness([
      { id: 'victim1', ownerId: 'u2', folder: 'inbox', threadId: VICTIM_THREAD, sizeBytes: 10, body: '', subject: '' },
    ]);
    await svc.saveDraft('u1', { to: '', subject: '', body: '', threadId: VICTIM_THREAD });
    await svc.saveDraft('u1', { to: '', subject: '', body: '', threadId: VICTIM_THREAD });
    const mine = rows.filter((r: any) => r.ownerId === 'u1');
    expect(mine).toHaveLength(2);
    for (const r of mine) expect(r.threadId).not.toBe(VICTIM_THREAD);
  });
});

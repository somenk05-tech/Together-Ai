import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * DRAFTS, AND THE ONE ROOM THEY SHARE WITH FAILED MAIL.
 *
 * A draft is a working copy, not correspondence, and every rule here follows
 * from that:
 *
 *  • none of the send-time rules apply while you are still writing — half an
 *    address is what a half-written message has;
 *  • autosave is idempotent by id, or a composer leaves thirty near-identical
 *    drafts behind it;
 *  • sending clears the draft it came from, or the citizen resumes it later
 *    and sends the same message twice;
 *  • discarding deletes rather than trashing — Trash is for things somebody
 *    actually sent or received;
 *  • `unsent` shows drafts AND failed together, because both answer one
 *    question: what is still waiting on me?
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function harness(rows: any[] = []) {
  let seq = 0;
  const matches = (where: any, r: any): boolean => {
    if (where.id && where.id !== r.id) return false;
    if (where.ownerId && where.ownerId !== r.ownerId) return false;
    if (typeof where.folder === 'string' && where.folder !== r.folder) return false;
    if (where.folder?.in && !where.folder.in.includes(r.folder)) return false;
    if (where.starred !== undefined && where.starred !== r.starred) return false;
    if (where.NOT?.folder && where.NOT.folder === r.folder) return false;
    if (where.read !== undefined && where.read !== r.read) return false;
    return true;
  };
  const prisma: any = {
    mailMessage: {
      create: async ({ data }: any) => {
        const row = { id: `m${++seq}`, createdAt: new Date('2026-08-05T10:00:00Z'), starred: false, threadId: null, failureReason: null, ...data };
        rows.push(row); return row;
      },
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id); Object.assign(r, data); return r;
      },
      findFirst: async ({ where }: any) => rows.find((r) => matches(where, r)) ?? null,
      findMany: async ({ where, select }: any) => {
        const hit = rows.filter((r) => matches(where ?? {}, r));
        return select?.sizeBytes ? hit.map((r) => ({ sizeBytes: r.sizeBytes })) : hit;
      },
      count: async ({ where }: any) => rows.filter((r) => matches(where, r)).length,
      delete: async ({ where }: any) => {
        const i = rows.findIndex((r) => r.id === where.id); return rows.splice(i, 1)[0];
      },
      deleteMany: async ({ where }: any) => {
        const keep = rows.filter((r) => !matches(where, r));
        const n = rows.length - keep.length;
        rows.length = 0; rows.push(...keep);
        return { count: n };
      },
    },
    mailAccount: { findUnique: async () => ({ id: 'a1', userId: 'u1', address: 'somen@togethercity.app' }) },
    user: { findUnique: async () => ({ id: 'u1', name: 'Somen', handle: 'somen', email: null, phone: null }) },
    emailDelivery: { count: async () => 0 },
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => ({ address: 'somen@togethercity.app' });
  return { svc, rows };
}

describe('saving what somebody is still writing', () => {
  it('holds an unfinished message — no recipient, no subject, no body', async () => {
    const { svc, rows } = harness();
    const d = await svc.saveDraft('u1', { to: '', subject: '', body: '' });
    expect(d.folder).toBe('draft');
    expect(rows).toHaveLength(1);
    // Your own unfinished words are not "unread".
    expect(rows[0].read).toBe(true);
  });

  it('autosave updates the same row rather than breeding new ones', async () => {
    const { svc, rows } = harness();
    const first = await svc.saveDraft('u1', { to: 'a@b.com', subject: 'hi', body: 'one' });
    await svc.saveDraft('u1', { id: first.id, to: 'a@b.com', subject: 'hi', body: 'one two' });
    await svc.saveDraft('u1', { id: first.id, to: 'a@b.com', subject: 'hi there', body: 'one two three' });
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe('one two three');
    expect(rows[0].subject).toBe('hi there');
  });

  it('will not edit somebody else’s draft, or a message that is not one', async () => {
    const { svc } = harness([
      { id: 'other', ownerId: 'u2', folder: 'draft', sizeBytes: 1, body: '', subject: '' },
      { id: 'sent1', ownerId: 'u1', folder: 'sent', sizeBytes: 1, body: '', subject: '' },
    ]);
    await expect(svc.saveDraft('u1', { id: 'other', to: '', subject: '', body: '' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.saveDraft('u1', { id: 'sent1', to: '', subject: '', body: '' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the draft does not survive its own sending', () => {
  it('clearDraft removes it', async () => {
    const { svc, rows } = harness([{ id: 'd1', ownerId: 'u1', folder: 'draft', sizeBytes: 10, body: '', subject: '' }]);
    await svc.clearDraft('u1', 'd1');
    expect(rows).toHaveLength(0);
  });

  it('a draft that is already gone is not an error — the message still went', async () => {
    const { svc } = harness();
    await expect(svc.clearDraft('u1', 'vanished')).resolves.toBeUndefined();
    await expect(svc.clearDraft('u1', undefined)).resolves.toBeUndefined();
  });

  it('never touches another citizen’s draft', async () => {
    const { svc, rows } = harness([{ id: 'd1', ownerId: 'u2', folder: 'draft', sizeBytes: 10, body: '', subject: '' }]);
    await svc.clearDraft('u1', 'd1');
    expect(rows).toHaveLength(1);
  });
});

describe('discarding a draft', () => {
  it('deletes it outright — Trash is for correspondence', async () => {
    const { svc, rows } = harness([{ id: 'd1', ownerId: 'u1', folder: 'draft', sizeBytes: 10, body: '', subject: '', toAddr: '', toName: '', fromAddr: '', fromName: '', snippet: '', read: true, starred: false, system: false, createdAt: new Date() }]);
    await svc.discardDraft('u1', 'd1');
    expect(rows).toHaveLength(0);
  });

  it('refuses anything that is not your own draft', async () => {
    const { svc } = harness([{ id: 'f1', ownerId: 'u1', folder: 'failed', sizeBytes: 10 }]);
    await expect(svc.discardDraft('u1', 'f1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('one room for what is still waiting on you', () => {
  const box = () => harness([
    { id: 'd1', ownerId: 'u1', folder: 'draft', sizeBytes: 5, body: '', subject: 'draft', toAddr: '', toName: '', fromAddr: '', fromName: '', snippet: '', read: true, starred: false, system: false, createdAt: new Date('2026-08-05T09:00:00Z') },
    { id: 'f1', ownerId: 'u1', folder: 'failed', sizeBytes: 5, body: '', subject: 'failed', toAddr: '', toName: '', fromAddr: '', fromName: '', snippet: '', read: true, starred: false, system: false, createdAt: new Date('2026-08-05T08:00:00Z') },
    { id: 's1', ownerId: 'u1', folder: 'sent', sizeBytes: 5, body: '', subject: 'sent', toAddr: '', toName: '', fromAddr: '', fromName: '', snippet: '', read: true, starred: false, system: false, createdAt: new Date('2026-08-05T07:00:00Z') },
  ]);

  it('unsent = drafts + failed, and nothing that was actually sent', async () => {
    const { svc } = box();
    const ids = (await svc.list('u1', { folder: 'unsent' })).map((m: any) => m.id).sort();
    expect(ids).toEqual(['d1', 'f1']);
  });

  it('each half is still addressable on its own', async () => {
    const { svc } = box();
    expect((await svc.list('u1', { folder: 'draft' })).map((m: any) => m.id)).toEqual(['d1']);
    expect((await svc.list('u1', { folder: 'failed' })).map((m: any) => m.id)).toEqual(['f1']);
  });

  it('the account counts drafts and failed apart, and their sum for the menu', async () => {
    const { svc } = box();
    const acct = await svc.account('u1');
    expect(acct.counts.draft).toBe(1);
    expect(acct.counts.failed).toBe(1);
    expect(acct.counts.unsent).toBe(2);
  });

  it('a mailbox with neither shows an empty room, not a missing one', async () => {
    const { svc } = harness();
    expect(await svc.list('u1', { folder: 'unsent' })).toEqual([]);
    expect((await svc.account('u1')).counts.unsent).toBe(0);
  });
});

describe('the quota still applies to a draft', () => {
  it('refuses a new draft that would overflow the mailbox', async () => {
    const { svc } = harness([{ id: 'big', ownerId: 'u1', folder: 'sent', sizeBytes: 10 * 1024 * 1024 * 1024 }]);
    await expect(svc.saveDraft('u1', { to: '', subject: 'x', body: 'y' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('but editing a draft SMALLER never fails on a full mailbox', async () => {
    const huge = 10 * 1024 * 1024 * 1024;
    const { svc } = harness([{ id: 'd1', ownerId: 'u1', folder: 'draft', sizeBytes: huge, body: 'x'.repeat(50), subject: '', toAddr: '', toName: '', fromAddr: '', fromName: '', snippet: '', read: true, starred: false, system: false, createdAt: new Date('2026-08-05T10:00:00Z') }]);
    await expect(svc.saveDraft('u1', { id: 'd1', to: '', subject: '', body: 'x' })).resolves.toBeDefined();
  });
});

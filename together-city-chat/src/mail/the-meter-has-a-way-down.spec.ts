import { QUOTA_BYTES } from './mail.constants';
import { MailService } from './mail.service';
import { FEED_CAP } from '../shared/paging';

/**
 * THE METER HAS A WAY DOWN, AND THE TRAIL ARRIVES IN ORDER.
 *
 * Four things the mail audit found on the reading-and-counting side, none of
 * which any existing suite could see because they all send one message to one
 * person and then stop looking.
 *
 *  1 · DELETING MAIL DID NOT FREE ANY SPACE. `remove()` moves a message to
 *      Trash and `usedBytes` sums every folder, so a citizen could delete five
 *      hundred messages, watch the meter not move, and be told "your mailbox is
 *      full" again with no explanation and no way out. Counting Trash is the
 *      right call — trashed mail is still stored — but a rule with no escape is
 *      a trap. There is a door now.
 *
 *  2 · THE ACCOUNT'S OWN ALLOWANCE WAS NEVER READ. MailAccount.quotaBytes has
 *      existed since the table was written; every check used the global
 *      constant, so raising one citizen's quota did nothing, silently.
 *
 *  3 · AND THE FALLBACK WAS NaN. `a ? Number(a.quotaBytes)` returns NaN for a
 *      row that has no allowance, and every `used + size > NaN` is false — so
 *      for exactly those accounts the quota stopped existing altogether.
 *
 *  4 · A LONG TRAIL HID ITS NEWEST MESSAGES. `thread()` read `asc` with a
 *      `take`, so past the cap it dropped the end you came for — including the
 *      reply you had just been notified about.
 *
 * Plus: a retry supersedes the attempt it was made from whether or not it
 * worked. Three retries on a dead address used to leave four identical rows in
 * Failed and four copies of the message against the quota.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const GB = 1024 * 1024 * 1024;

function harness(opts: { quotaBytes?: number } = {}) {
  const rows: any[] = [];
  let seq = 0;
  const matches = (where: any, r: any): boolean => {
    if (where.id && where.id !== r.id) return false;
    if (where.ownerId && where.ownerId !== r.ownerId) return false;
    if (where.threadId !== undefined && where.threadId !== r.threadId) return false;
    if (typeof where.folder === 'string' && where.folder !== r.folder) return false;
    if (where.folder?.in && !where.folder.in.includes(r.folder)) return false;
    if (where.NOT?.folder && where.NOT.folder === r.folder) return false;
    return true;
  };
  const account = {
    userId: 'u1', address: 'somen@togethercity.app',
    // Present ONLY when the test says so. An account row with no allowance is
    // the shape assertion 3 is about, and it is the shape most of this
    // module's other harnesses happen to have.
    ...(opts.quotaBytes === undefined ? {} : { quotaBytes: opts.quotaBytes }),
  };
  const prisma: any = {
    mailMessage: {
      create: async ({ data }: any) => {
        const row = {
          id: `m${++seq}`, createdAt: new Date('2026-08-14T02:00:00Z'), starred: false,
          threadId: null, projectId: null, ccAddrs: null, bccAddrs: null, failureReason: null, ...data,
        };
        rows.push(row); return row;
      },
      findFirst: async ({ where }: any) => rows.find((r) => matches(where, r)) ?? null,
      // orderBy and take are HONOURED here, unlike in the other harnesses,
      // because the ordering is what two of these assertions are about. A stub
      // that ignores orderBy cannot tell `asc + take` from `desc + take`, which
      // is precisely the bug.
      findMany: async ({ where, select, orderBy, take }: any) => {
        let hit = rows.filter((r) => matches(where ?? {}, r));
        if (orderBy?.createdAt) {
          const dir = orderBy.createdAt === 'desc' ? -1 : 1;
          hit = [...hit].sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()));
        }
        if (take) hit = hit.slice(0, take);
        return select?.sizeBytes ? hit.map((r) => ({ sizeBytes: r.sizeBytes })) : hit;
      },
      aggregate: async ({ where, _sum }: any) => ({
        _sum: _sum?.sizeBytes
          ? { sizeBytes: rows.filter((r) => matches(where ?? {}, r)).reduce((n: number, r: any) => n + (r.sizeBytes ?? 0), 0) }
          : {},
      }),
      update: async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id); Object.assign(r, data); return r;
      },
      updateMany: async () => ({ count: 0 }),
      delete: async ({ where }: any) => {
        const i = rows.findIndex((r) => r.id === where.id); return rows.splice(i, 1)[0];
      },
      deleteMany: async ({ where }: any) => {
        const keep = rows.filter((r) => !matches(where ?? {}, r));
        const n = rows.length - keep.length;
        rows.length = 0; rows.push(...keep);
        return { count: n };
      },
      count: async ({ where }: any) => rows.filter((r) => matches(where, r)).length,
    },
    mailProject: { findFirst: async () => null },
    mailAccount: { findUnique: async () => account },
    emailDelivery: { count: async () => 0, create: async () => undefined },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) return { id: 'u1', name: 'Somen', handle: 'somen' };
        const known: any = {
          alice: { id: 'u2', name: 'Alice', handle: 'alice' },
          somen: { id: 'u1', name: 'Somen', handle: 'somen' },
        };
        return known[where.handle] ?? null;
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  const svc: any = Object.create(MailService.prototype);
  svc.prisma = prisma;
  svc.ensureAccount = async () => account;
  svc.isConnected = async () => true;
  svc.linkAttachments = async () => undefined;
  svc.clearDraft = async () => undefined;
  return { svc, rows };
}

let put_n = 0;
function put(rows: any[], r: any) {
  const row = {
    id: `x${++put_n}`, ownerId: 'u1', boxUserId: 'u1', folder: 'inbox',
    fromAddr: 'alice@togethercity.app', fromName: 'Alice',
    toAddr: 'somen@togethercity.app', toName: 'Somen',
    subject: 's', snippet: 's', body: 'b', sizeBytes: 100,
    read: true, starred: false, system: false, threadId: null, projectId: null,
    ccAddrs: null, bccAddrs: null, failureReason: null,
    createdAt: new Date('2026-08-01T00:00:00Z'), ...r,
  };
  rows.push(row); return row;
}

describe('emptying the trash', () => {
  it('deletes what is in the trash, and only this citizen’s', async () => {
    const { svc, rows } = harness();
    put(rows, { folder: 'trash', sizeBytes: 400 });
    put(rows, { folder: 'trash', sizeBytes: 600 });
    put(rows, { folder: 'inbox', sizeBytes: 90 });
    put(rows, { folder: 'trash', sizeBytes: 5000, ownerId: 'u2' });

    expect(await svc.emptyTrash('u1')).toEqual({ ok: true, deleted: 2, freedBytes: 1000 });
    expect(rows.map((r) => `${r.ownerId}/${r.folder}`).sort()).toEqual(['u1/inbox', 'u2/trash']);
  });

  it('moves the meter, which deleting a message on its own does not', async () => {
    // This is the whole finding in four lines. "Delete" is a move, and the
    // mailbox is summed across every folder — so before this endpoint existed
    // there was no sequence of actions a citizen could take to get a byte back.
    const { svc, rows } = harness();
    const m = put(rows, { folder: 'inbox', sizeBytes: 1000 });

    expect(await svc.usedBytes('u1')).toBe(1000);
    await svc.remove('u1', m.id);
    expect(rows[0].folder).toBe('trash');
    expect(await svc.usedBytes('u1')).toBe(1000);

    await svc.emptyTrash('u1');
    expect(await svc.usedBytes('u1')).toBe(0);
  });
});

describe('what a full mailbox is told', () => {
  it('names the account’s own size and the trash, not a hardcoded 10 GB', async () => {
    const { svc, rows } = harness({ quotaBytes: 2 * GB });
    put(rows, { sizeBytes: 2 * GB });

    await expect(svc.saveDraft('u1', { to: 'alice@togethercity.app', subject: 'hi', body: 'x' }))
      .rejects.toThrow(/2\.0 GB mailbox is full/);
    await expect(svc.saveDraft('u1', { to: 'alice@togethercity.app', subject: 'hi', body: 'x' }))
      .rejects.toThrow(/empty your Trash/);
  });

  it('honours an allowance the account carries', async () => {
    const { svc, rows } = harness({ quotaBytes: 4096 });
    put(rows, { sizeBytes: 4000 });
    await expect(svc.send('u1', { to: 'alice@togethercity.app', subject: 'a fairly long subject line', body: 'and a body to go with it' }))
      .rejects.toThrow(/mailbox is full/);
  });

  it('falls back to the constant when the account carries no allowance at all', async () => {
    // `a ? Number(a.quotaBytes)` is NaN for this account shape, and every
    // `used + size > NaN` is false — so the quota silently stopped applying to
    // exactly the accounts that had never had one set.
    const { svc, rows } = harness();
    put(rows, { sizeBytes: QUOTA_BYTES });
    await expect(svc.send('u1', { to: 'alice@togethercity.app', subject: 'hi', body: 'x' }))
      .rejects.toThrow(/mailbox is full/);
  });
});

describe('a trail past the cap', () => {
  const T = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('arrives oldest-first, as a conversation reads', async () => {
    const { svc, rows } = harness();
    put(rows, { threadId: T, subject: 'first', createdAt: new Date('2026-08-01T09:00:00Z') });
    put(rows, { threadId: T, subject: 'second', createdAt: new Date('2026-08-02T09:00:00Z') });
    put(rows, { threadId: T, subject: 'third', createdAt: new Date('2026-08-03T09:00:00Z') });

    const trail = await svc.thread('u1', T);
    expect(trail.map((m: any) => m.subject)).toEqual(['first', 'second', 'third']);
  });

  it('keeps the NEWEST messages when it has to drop some', async () => {
    // A cap has to drop something. Dropping the end you came for — the reply
    // you were just notified about — is the one choice that makes the screen
    // useless, and it is what `asc` + `take` does.
    const { svc, rows } = harness();
    const n = FEED_CAP + 2;
    for (let i = 0; i < n; i++) {
      put(rows, { threadId: T, subject: `msg ${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) });
    }

    const trail = await svc.thread('u1', T);
    expect(trail).toHaveLength(FEED_CAP);
    expect(trail[trail.length - 1].subject).toBe(`msg ${n - 1}`);
    expect(trail[0].subject).toBe('msg 2');
  });
});

describe('a retry supersedes the attempt it was made from — when there IS an attempt', () => {
  /**
   * ── THE RULE, AND THE HALF OF IT THAT WAS FALSE (fifth audit, 29 Aug) ────
   *
   * The rule is right: a retry that writes a row of its own — Sent, or Failed
   * with the new reason — supersedes the row it was made from, or three
   * retries on a dead address leave four identical rows in Failed and four
   * copies against the quota.
   *
   * The implementation removed the source in a `finally`, on the strength of a
   * sentence that said every path through `send()` writes a row. It does not.
   * It throws BEFORE writing when the mailbox is full, when the recipient is
   * no longer connected, when the message names more external addresses than
   * one may carry, when the day's external budget is spent, and when the body
   * is empty. Press Retry on a full mailbox — which is exactly what a citizen
   * does to make room — and the message was deleted with nothing written in
   * its place. The only copy of what they had written, removed by the button
   * offered for saving it.
   */
  it('keeps the citizen’s message when the attempt filed nothing', async () => {
    const { svc, rows } = harness();
    const m = put(rows, { folder: 'failed', toAddr: 'nobody@togethercity.app', failureReason: 'no such mailbox' });

    await expect(svc.retry('u1', m.id)).rejects.toThrow(/No such city mailbox/);
    expect(rows.filter((r) => r.folder === 'failed')).toHaveLength(1);
    expect(rows.find((r) => r.id === m.id)?.body).toBe('b');
  });

  it('and the duplicate the old rule existed to prevent still cannot happen', async () => {
    // The reason `finally` was reached for in the first place. On a path that
    // writes nothing, retrying repeatedly cannot accumulate rows either —
    // there is one row, it is the original, and it stays one.
    const { svc, rows } = harness();
    const m = put(rows, { folder: 'failed', toAddr: 'nobody@togethercity.app', failureReason: 'no such mailbox' });

    await expect(svc.retry('u1', m.id)).rejects.toThrow(/No such city mailbox/);
    await expect(svc.retry('u1', m.id)).rejects.toThrow(/No such city mailbox/);
    await expect(svc.retry('u1', m.id)).rejects.toThrow(/No such city mailbox/);
    expect(rows.filter((r) => r.folder === 'failed')).toHaveLength(1);
  });

  it('a full mailbox does not eat the message it was asked to resend', async () => {
    // The reachable one. send() throws on the quota check before anything is
    // written, and the `finally` ran on it.
    const { svc, rows } = harness({ quotaBytes: 4096 });
    const m = put(rows, { folder: 'failed', toAddr: 'alice@togethercity.app', sizeBytes: 4000, failureReason: 'earlier failure' });

    await expect(svc.retry('u1', m.id)).rejects.toThrow(/mailbox is full/);
    expect(rows.find((r) => r.id === m.id)).toBeDefined();
  });
});

import { NotificationsService, NotificationRow } from './notifications.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * CHATS DO NOT LIVE IN THE BELL. (Owner decision, 9 Aug 2026.)
 *
 * A chat message already announces itself in the Chats tab badge and as a
 * push — and it was ALSO a row in "Likes, comments & follows". Three surfaces
 * asserting one fact, and the third one wrong: the social notification feed
 * is for likes, comments, follows and their kin, not correspondence.
 *
 * The message row is still WRITTEN (it drives the corner toast over the
 * socket and the per-conversation clearing) — it just never surfaces in the
 * feed, the badge count, or mark-all-read. These fakes honour the kind
 * filter, unlike the golden spec's, precisely so this file fails the moment
 * someone removes the exclusion.
 */
function build() {
  const table: NotificationRow[] = [];
  let seq = 0;
  const FIXED = new Date('2026-08-01T10:00:00Z');
  const kindMatch = (row: NotificationRow, w: any): boolean =>
    w === undefined ? true
      : (w && typeof w === 'object' && 'not' in w) ? row.kind !== w.not
      : row.kind === w;
  const rowMatch = (row: NotificationRow, where: any): boolean =>
    (where.userId === undefined || row.userId === where.userId)
    && (where.read === undefined || row.read === where.read)
    && kindMatch(row, where.kind);

  const svc: any = Object.create(NotificationsService.prototype);
  svc.log = { warn: () => undefined };
  svc.prisma = {
    notification: {
      create: async (a: any) => {
        const row = { id: `n${++seq}`, read: false, createdAt: FIXED, body: null, href: null, actorId: null, entityId: null, ...a.data } as NotificationRow;
        table.push(row); return row;
      },
      findFirst: async () => null,
      findMany: async (a: any) => table.filter((r) => rowMatch(r, a.where)),
      count: async (a: any) => table.filter((r) => rowMatch(r, a.where)).length,
      update: async (a: any) => { const row = table.find((r) => r.id === a.where.id)!; Object.assign(row, a.data); return row; },
      updateMany: async (a: any) => { table.filter((r) => rowMatch(r, a.where)).forEach((r) => Object.assign(r, a.data)); return {}; },
    },
  };
  svc.gateway = { emitNew: () => undefined, emitCount: () => undefined };
  return { svc, table };
}

const seed = async (svc: any, table: NotificationRow[]) => {
  await svc.prisma.notification.create({ data: { userId: 'u1', kind: 'message', title: 'somen', body: 'hi', entityId: 'c1' } });
  await svc.prisma.notification.create({ data: { userId: 'u1', kind: 'like', title: 'Asha liked your post' } });
  expect(table).toHaveLength(2);
};

describe('chats do not live in the bell', () => {
  it('the feed leaves chat rows out', async () => {
    const { svc, table } = build();
    await seed(svc, table);
    const feed = await svc.listFor('u1');
    expect(feed.map((n: any) => n.kind)).toEqual(['like']);
  });

  it('the badge count leaves chat rows out', async () => {
    const { svc, table } = build();
    await seed(svc, table);
    expect(await svc.unreadCount('u1')).toBe(1);
  });

  it('mark-all-read leaves chat rows alone', async () => {
    const { svc, table } = build();
    await seed(svc, table);
    await svc.markAllRead('u1');
    const message = table.find((r) => r.kind === 'message')!;
    const like = table.find((r) => r.kind === 'like')!;
    // The chat row's read state belongs to markConversationRead (opening the
    // chat), not to the bell's broom.
    expect(message.read).toBe(false);
    expect(like.read).toBe(true);
  });
});

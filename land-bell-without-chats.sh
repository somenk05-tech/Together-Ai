#!/bin/bash
# land-bell-without-chats.sh — chats leave the notification centre (9 Aug 2026).
# The bell feed ("Likes, comments & follows"), its badge count, and mark-all-
# read now exclude kind 'message'. The message row is still written — it
# drives the corner toast and per-conversation clearing — it just never
# surfaces in the feed. The Chats tab badge remains the one place chats count.
# Existing 'message' rows in the DB simply stop matching; no migration needed.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The bell stops repeating the chats"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

SPEC=together-city-chat/src/notifications/not-in-the-bell.spec.ts
cat > "$SPEC" <<'SPECEOF'
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
SPECEOF

cd together-city-chat
# Watch the guard fail first: on the unpatched service these three tests must
# fail. A guard that passes before the fix guards nothing.
if npx jest not-in-the-bell --silent >/dev/null 2>&1; then
  echo "not-in-the-bell passed BEFORE the fix — the guard is broken; refusing."
  exit 1
fi
echo "guard fails before the fix, as it must"
cd ..

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

P = 'together-city-chat/src/notifications/notifications.service.ts'

patch(P,
  "  /** Recent notifications for a user, newest first. */\n  async listFor(userId: string, limit = 50) {\n    const rows = await this.notif.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit }).catch(swallowed('notifications.listFor', [] as NotificationRow[]));",
  "  /** Recent notifications for a user, newest first. Chats are NOT here —\n   *  a message row exists only to drive the toast and per-conversation\n   *  clearing; the Chats tab is the one surface that counts correspondence\n   *  (owner decision, 9 Aug 2026 — see not-in-the-bell.spec.ts). */\n  async listFor(userId: string, limit = 50) {\n    const rows = await this.notif.findMany({ where: { userId, kind: { not: 'message' } }, orderBy: { createdAt: 'desc' }, take: limit }).catch(swallowed('notifications.listFor', [] as NotificationRow[]));")

patch(P,
  "    return this.notif.count({ where: { userId, read: false } }).catch(() => 0);",
  "    return this.notif.count({ where: { userId, read: false, kind: { not: 'message' } } }).catch(() => 0);")

patch(P,
  "    await this.notif.updateMany({ where: { userId, read: false }, data: { read: true } }).catch(swallowed('notifications.markAllRead', undefined));",
  "    await this.notif.updateMany({ where: { userId, read: false, kind: { not: 'message' } }, data: { read: true } }).catch(swallowed('notifications.markAllRead', undefined));")

PATCHEOF

cd together-city-chat
echo "== gates =="
npx tsc --noEmit
npx jest src/notifications --silent
cd ..

git add together-city-chat/src/notifications/notifications.service.ts "$SPEC"
git commit -m "$MARK

A chat message announced itself three times: the Chats tab badge, a push,
and a row in the social notification centre. The third was wrong — the
bell is for likes, comments, follows and their kin, not correspondence
(owner, 9 Aug, from a phone screenshot of 'hi' filed under Likes,
comments & follows).

listFor, unreadCount and markAllRead now exclude kind 'message'. The row
itself is still written: it drives the corner toast over the socket and
markConversationRead's per-conversation clearing. Stale message rows in
the DB just stop matching — no migration. Guard: not-in-the-bell.spec.ts
with kind-aware fakes (the golden spec's fakes ignore where.kind, so it
could not catch this); watched failing on the unpatched service first."
git push
echo "LANDED."

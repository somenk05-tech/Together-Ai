import { NotificationsService, NotificationRow } from './notifications.service';

/**
 * What the notifications engine DOES today, written down. (P0-2.)
 *
 * The audit's reason for putting notifications this high: delivery failure is
 * silent, and silence looks identical to "nothing happened". These tests
 * record the DECISIONS — who gets notified, who is suppressed, what the row
 * says, when a row is updated in place versus created — over an in-memory
 * fake of the notification table and stubs for every transport. No assertion
 * here says the behaviour is right; it says what it is, so the next change
 * shows up as a diff.
 *
 * Recorded behaviours worth naming (all current, none aspirational):
 *  · you are never notified of your own action
 *  · message notifications group per conversation, updating in place
 *  · a recipient actively viewing the conversation is suppressed; muted too
 *  · a ringing phone ignores BOTH rules — every call is its own row, muted
 *    or not, viewing or not
 *  · a dating chat titles with the profile's name (decided 1 Aug: one
 *    identity everywhere) while its href stays inside the Dating Hub
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const FIXED = new Date('2026-08-01T10:00:00Z');

function build(opts: {
  datingMatch?: { conversationId: string; userOneId: string; userTwoId: string; revealByOne: boolean; revealByTwo: boolean } | null;
  online?: string[]; openConvo?: Record<string, string | null>; muted?: string[];
  previewOptIn?: string[];
} = {}) {
  const table: NotificationRow[] = [];
  let seq = 0;
  const emitted: Array<{ ev: string; userId: string; payload?: unknown; count?: number }> = [];
  const pushes: Array<{ via: string; tokens: string[]; payload: unknown }> = [];

  const svc: any = Object.create(NotificationsService.prototype);
  (svc as any).log = { warn: () => undefined };
  svc.prisma = {
    notification: {
      create: async (a: any) => {
        const row = { id: `n${++seq}`, read: false, createdAt: FIXED, body: null, href: null, ...a.data } as NotificationRow;
        table.push(row); return row;
      },
      findFirst: async (a: any) => table.filter((r) =>
        r.userId === a.where.userId && r.kind === a.where.kind
        && (r as any).entityId === a.where.entityId && r.read === a.where.read).slice(-1)[0] ?? null,
      findMany: async () => table,
      count: async (a: any) => table.filter((r) => r.userId === a.where.userId && !r.read).length,
      update: async (a: any) => {
        const row = table.find((r) => r.id === a.where.id)!;
        // upsertMessageNotification bumps createdAt with a live new Date() —
        // pin it so the record stays deterministic.
        Object.assign(row, a.data, a.data.createdAt ? { createdAt: FIXED } : {});
        return row;
      },
      updateMany: async () => ({}),
    },
    user: {
      findUnique: async (a: any) => ({ name: a.where.id === 'sender1' ? 'Asha Verma' : 'Someone Else', profileImage: null }),
    },
    datingMatch: {
      findMany: async () => (opts.datingMatch ? [opts.datingMatch] : []),
      findFirst: async (a: any) => (opts.datingMatch && opts.datingMatch.conversationId === a.where.conversationId ? opts.datingMatch : null),
    },
    // identityIn now reads the sender's dating display name for a dating push;
    // no firstName here, so shownName falls back to the account name.
    datingProfile: { findUnique: async () => ({ extras: null }) },
    deviceToken: {
      findMany: async (a: any) => [
        { token: `fcm-${a.where.userId}`, platform: 'android' },
        { token: `web-${a.where.userId}`, platform: 'webpush' },
      ],
    },
    conversationMember: {
      findUnique: async (a: any) => ({ muted: (opts.muted ?? []).includes(a.where.conversationId_userId.userId) }),
    },
    // The recipient's answer to "may a dating message's words reach my lock
    // screen". Absent row = no, which is the default and what these goldens
    // record; `a-dating-push-does-not-unmask.spec.ts` owns the other branch.
    privacySetting: {
      findUnique: async (a: any) => ((opts.previewOptIn ?? []).includes(a.where.userId_key.userId) ? { value: 'true' } : null),
    },
  };
  svc.presence = { isOnline: async (u: string) => (opts.online ?? []).includes(u) };
  svc.redis = { openConversationsOf: async (u: string) => { const c = (opts.openConvo ?? {})[u]; return c ? [c] : []; } };
  svc.gateway = {
    emitNew: (userId: string, payload: unknown, count: number) => emitted.push({ ev: 'new', userId, payload, count }),
    emitCount: (userId: string, count: number) => emitted.push({ ev: 'count', userId, count }),
  };
  svc.fcm = { send: async (tokens: string[], payload: unknown) => { if (tokens.length) pushes.push({ via: 'fcm', tokens, payload }); } };
  svc.webpush = { send: async (tokens: string[], payload: unknown) => { if (tokens.length) pushes.push({ via: 'webpush', tokens, payload }); } };
  return { svc, table, emitted, pushes };
}

describe('what the notifications engine decides today', () => {
  it('never notifies you of your own action', async () => {
    const { svc, table, emitted } = build();
    await svc.create({ userId: 'u1', actorId: 'u1', kind: 'like', title: 'You liked your own post' });
    expect({ table, emitted }).toMatchSnapshot();
  });

  it('a plain notification: the row, the emit, the count', async () => {
    const { svc, table, emitted } = build();
    await svc.create({ userId: 'u1', actorId: 'u2', kind: 'connection_request', title: 'Someone sent you a connection request', href: '/connections' });
    expect({ table, emitted }).toMatchSnapshot();
  });

  it('every notification reaches the phone — only when the person is not here', async () => {
    // PUSH IS THE DEFAULT (owner, 28 Aug). It was opt-in and three of roughly
    // forty callers opted in, so the alert written to bring somebody back
    // reached the bell of a person who was not looking at the bell. The rule
    // that made opt-in defensible is the one kept: nothing is sent to somebody
    // who is HERE, because a push on top of a live toast is the same news
    // twice.
    const away = build();
    await away.svc.create({ userId: 'u1', actorId: 'u2', kind: 'dating_match', title: 'It’s a match', href: '/dating/matches', push: { deepLink: 'togethercity://dating/matches' } });
    expect(away.pushes.map((p) => p.via).sort()).toEqual(['fcm', 'webpush']);
    expect((away.pushes.find((p) => p.via === 'fcm')!.payload as { deepLink: string }).deepLink).toBe('togethercity://dating/matches');
    expect((away.pushes.find((p) => p.via === 'webpush')!.payload as { url: string }).url).toBe('/dating/matches');

    const here = build({ online: ['u1'] });
    await here.svc.create({ userId: 'u1', actorId: 'u2', kind: 'dating_match', title: 'It’s a match', href: '/dating/matches', push: { deepLink: 'togethercity://dating/matches' } });
    expect(here.pushes).toEqual([]);

    // The case this test used to assert the opposite of: a caller that says
    // nothing about push. It goes out, and the deep link is derived from the
    // href rather than left empty.
    const plain = build();
    await plain.svc.create({ userId: 'u1', actorId: 'u2', kind: 'connection_request', title: 'A request', href: '/connections' });
    expect(plain.pushes.map((p) => p.via).sort()).toEqual(['fcm', 'webpush']);
    expect((plain.pushes.find((p) => p.via === 'fcm')!.payload as { deepLink: string }).deepLink).toBe('togethercity://connections');

    // And the way out, for a notification that should not interrupt anybody.
    const quiet = build();
    await quiet.svc.create({ userId: 'u1', actorId: 'u2', kind: 'system', title: 'A digest', href: '/moderation', silent: true });
    expect(quiet.pushes).toEqual([]);
  });

  it('messages group per conversation, updating in place; a second chat gets its own row', async () => {
    const { svc, table } = build();
    await svc.notifyNewMessage({ conversationId: 'c1', senderId: 'sender1', recipientIds: ['u1'], preview: 'first' });
    await svc.notifyNewMessage({ conversationId: 'c1', senderId: 'sender1', recipientIds: ['u1'], preview: 'second — replaces, not appends' });
    await svc.notifyNewMessage({ conversationId: 'c2', senderId: 'sender1', recipientIds: ['u1'], preview: 'a different chat' });
    expect(table).toMatchSnapshot();
  });

  it('viewing the conversation suppresses; being muted suppresses', async () => {
    const { svc, table, pushes } = build({ online: ['viewer'], openConvo: { viewer: 'c1' }, muted: ['mutedone'] });
    await svc.notifyNewMessage({ conversationId: 'c1', senderId: 'sender1', recipientIds: ['viewer', 'mutedone', 'plain'], preview: 'hello' });
    expect({ rowsFor: table.map((r) => r.userId), pushes }).toMatchSnapshot();
  });

  it('a ringing phone ignores both rules — every call its own row', async () => {
    const { svc, table, pushes } = build({ online: ['viewer'], openConvo: { viewer: 'c1' }, muted: ['mutedone'] });
    await svc.notifyIncomingCall({ conversationId: 'c1', callerId: 'sender1', recipientIds: ['viewer', 'mutedone'], callId: 'call1', type: 'video' });
    await svc.notifyIncomingCall({ conversationId: 'c1', callerId: 'sender1', recipientIds: ['viewer'], callId: 'call2', type: 'audio' });
    expect({ table, pushes }).toMatchSnapshot();
  });

  it('a dating chat titles with the profile name — one identity — and keeps the dating href', async () => {
    const dm = { conversationId: 'c9', userOneId: 'sender1', userTwoId: 'u1', revealByOne: false, revealByTwo: false };
    const { svc, table } = build({ datingMatch: dm });
    await svc.notifyNewMessage({ conversationId: 'c9', senderId: 'sender1', recipientIds: ['u1'], preview: 'hi' });
    const revealed = build({ datingMatch: { ...dm, revealByOne: true } });
    await revealed.svc.notifyNewMessage({ conversationId: 'c9', senderId: 'sender1', recipientIds: ['u1'], preview: 'hi again' });
    // A dating push carries the profile name (shownName) and NO city photo
    // (blocker 06); reveal flags do not change the name; the href says the hub.
    expect({
      titleBeforeReveal: table[0]?.title,
      titleAfterReveal: revealed.table[0]?.title,
      hrefIsDating: (table[0] as any)?.href,
    }).toMatchSnapshot();
  });
});

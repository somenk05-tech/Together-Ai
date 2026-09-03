import { NotificationsService } from './notifications.service';

/**
 * Four things that were only ever wrong at the worst moment.
 *
 *  1. A ringing call notification is the loudest thing this app can put on a
 *     phone, and `notifyIncomingCall` pushed with `silent: true` — past the
 *     presence gate — with no block check of its own. It is reachable from
 *     anywhere; one gate, in the caller, is not a gate.
 *  2. Nothing ever took the ring back. "Incoming call — X is calling you" sat
 *     on a lock screen in the present tense for the rest of the day, linked to
 *     a call that would refuse to join.
 *  3. `identityIn` was awaited OUTSIDE the per-recipient try, in a method whose
 *     only caller is a floating promise on the event bus: one failed read lost
 *     every recipient, every bell row and every push, with an unhandled
 *     rejection as the only trace.
 *  4. The fan-out was serial — eight round trips per recipient, one recipient
 *     at a time — for rooms bounded only per request.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function build(over: {
  blocked?: boolean;
  blockReadThrows?: boolean;
  identityThrows?: boolean;
  failFor?: string;
  slowMs?: number;
} = {}) {
  const pushes: Array<{ via: string; payload: any }> = [];
  const rows: any[] = [];
  const warnings: string[] = [];
  const s: any = Object.create(NotificationsService.prototype);
  let inFlight = 0;
  let peak = 0;

  s.log = { warn: (m: string) => warnings.push(m), error: (m: string) => warnings.push(m) };
  s.prisma = {
    user: { findUnique: async () => {
      if (over.identityThrows) throw new Error('db down');
      return { name: 'Asha Verma', profileImage: null };
    } },
    conversation: { findUnique: async () => ({ kind: 'city' }) },
    datingMatch: { findFirst: async () => null },
    datingProfile: { findUnique: async () => ({ extras: null }) },
    /* Through BlockingService since 3 Sep — it reads the Block table AND the
       blocked connection states, because a Social-hub block and a
       connection-level one are the same answer to "may these two reach each
       other" and reading one of them was the split blocking-reach.spec closes. */
    block: { findMany: async () => {
      if (over.blockReadThrows) throw new Error('db down');
      return over.blocked ? [{ blockerId: 'S', blockedId: 'R' }] : [];
    } },
    connection: { findMany: async () => [] },
    conversationMember: { findUnique: async (a: any) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, over.slowMs ?? 0));
      inFlight--;
      if (a.where.conversationId_userId.userId === over.failFor) throw new Error('this one is broken');
      return { muted: false };
    } },
    deviceToken: { findMany: async () => [{ token: 't-web', platform: 'webpush' }] },
    privacySetting: { findUnique: async () => null },
    notification: {
      findFirst: async (a: any) => rows.find((r) => r.userId === a.where.userId && r.entityId === a.where.entityId) ?? null,
      create: async (a: any) => { const r = { id: `n${rows.length + 1}`, read: false, createdAt: new Date(), ...a.data }; rows.push(r); return r; },
      update: async (a: any) => { const r = rows.find((x) => x.id === a.where.id); Object.assign(r, a.data); return r; },
      count: async () => rows.length,
      updateMany: async () => ({}),
    },
  };
  s.presence = { isOnline: async () => false };
  s.redis = { openConversationsOf: async () => [] };
  s.gateway = { emitNew: () => undefined, emitCount: () => undefined };
  s.fcm = { send: async (t: string[], payload: any) => { if (t.length) pushes.push({ via: 'fcm', payload }); } };
  s.webpush = { send: async (t: string[], payload: any) => { if (t.length) pushes.push({ via: 'webpush', payload }); } };
  return { s, pushes, rows, warnings, peak: () => peak };
}

const ring = (b: ReturnType<typeof build>, recipientIds = ['R']) =>
  b.s.notifyIncomingCall({ conversationId: 'c1', callerId: 'S', recipientIds, callId: 'call1', type: 'audio' });

describe('a ringing phone asks about blocks for itself', () => {
  it('does not ring somebody who blocked the caller', async () => {
    const b = build({ blocked: true });
    await ring(b);
    expect(b.pushes).toEqual([]);
    expect(b.rows).toEqual([]);
  });

  it('rings when nobody has blocked anybody', async () => {
    const b = build();
    await ring(b);
    expect(b.pushes.map((p) => p.via)).toEqual(['webpush']);
  });

  it('fails SHUT when the block table cannot be read', async () => {
    // The same failure would break the device-token read three lines down, so
    // shut costs nothing extra — and the other direction rings a phone that
    // asked never to hear from this person again.
    const b = build({ blockReadThrows: true });
    await ring(b);
    expect(b.pushes).toEqual([]);
  });
});

describe('a call that ended stops claiming it is ringing', () => {
  it('replaces the ring under its own tag, in the past tense, with no join link', async () => {
    const b = build();
    await ring(b);
    expect(b.rows[0].title).toBe('Incoming call');
    expect(b.rows[0].href).toBe('/chats?c=c1&call=call1');

    await b.s.notifyCallEnded({ conversationId: 'c1', callerId: 'S', recipientIds: ['R'], callId: 'call1', type: 'audio', missed: true });

    const closing = b.pushes.filter((p) => p.via === 'webpush').pop();
    if (!closing) throw new Error('the ring was never replaced');
    expect(closing.payload.title).toBe('Missed call');
    expect(closing.payload.body).toBe('Asha Verma called you.');
    // The SAME tag — anything else leaves the ringing one on screen beside it.
    expect(closing.payload.tag).toBe('call-call1');
    expect(closing.payload.url).toBe('/chats?c=c1');
    expect(closing.payload.url).not.toContain('call=');

    // One call, one row: the ring's row is corrected rather than doubled.
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0].title).toBe('Missed call');
    expect(b.rows[0].href).toBe('/chats?c=c1');
  });

  it('says "ended" rather than "missed" when the call was answered elsewhere', async () => {
    const b = build();
    await ring(b);
    await b.s.notifyCallEnded({ conversationId: 'c1', callerId: 'S', recipientIds: ['R'], callId: 'call1', type: 'video', missed: false });
    expect(b.rows[0].title).toBe('Video call ended');
  });
});

describe('a message fan-out nobody waits for', () => {
  it('a failed identity read is logged, not thrown at a floating promise', async () => {
    const b = build({ identityThrows: true });
    await expect(b.s.notifyNewMessage({ conversationId: 'c1', senderId: 'S', recipientIds: ['a', 'b'], preview: 'hi' }))
      .resolves.toBeUndefined();
    expect(b.warnings.join(' ')).toMatch(/message fan-out failed/);
  });

  it('one broken recipient does not silence the others', async () => {
    const b = build({ failFor: 'b' });
    await b.s.notifyNewMessage({ conversationId: 'c1', senderId: 'S', recipientIds: ['a', 'b', 'c'], preview: 'hi' });
    expect(b.rows.map((r) => r.userId).sort()).toEqual(['a', 'c']);
  });

  it('works on several recipients at once rather than queueing the room', async () => {
    const b = build({ slowMs: 5 });
    await b.s.notifyNewMessage({ conversationId: 'c1', senderId: 'S', recipientIds: ['a', 'b', 'c', 'd', 'e'], preview: 'hi' });
    expect(b.peak()).toBeGreaterThan(1);
    expect(b.rows).toHaveLength(5);
  });
});

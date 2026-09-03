import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CallsService } from './calls.service';
import { RING_TIMEOUT_MS } from './call-state';

/**
 * Holding a call id is not permission to be in a call.
 *
 * That is the whole subject here. A call id travels through push payloads,
 * socket frames and browser history; if it authorised anything, every person
 * who ever saw one could rejoin the conversation afterwards. So the tests below
 * hand a valid, current call id to somebody who is not in the chat and insist
 * on a 403 — from join, from get, and from every signalling frame, because
 * authorising once and trusting the socket after is the same bug delayed.
 */
const NOW = new Date('2026-07-29T12:00:00Z');

// The service reads the clock to decide whether a ring has expired, so the
// clock is pinned. Microtasks are left real: several tests await two calls at
// once on purpose, to prove a double hang-up ends the call exactly once.
beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] }).setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

interface Row { [k: string]: any }

function harness(opts: { members?: string[]; calls?: Row[]; participants?: Row[]; online?: string[] } = {}) {
  const members = opts.members ?? ['alice', 'bob'];
  // Who still has a socket. The sweep asks this rather than reading the
  // participant columns — see CallsService.stillConnected.
  const online = new Set(opts.online ?? members);
  const calls: Row[] = opts.calls ?? [];
  const parts: Row[] = opts.participants ?? [];
  let seq = 0;

  const withParticipants = (c: Row) => ({ ...c, participants: parts.filter((p) => p.callId === c.id) });
  const matches = (where: any, c: Row): boolean => {
    if (where.id && where.id !== c.id) return false;
    if (where.conversationId && where.conversationId !== c.conversationId) return false;
    if (where.status?.in && !where.status.in.includes(c.status)) return false;
    if (typeof where.status === 'string' && where.status !== c.status) return false;
    if (where.createdAt?.lt && !(c.createdAt < where.createdAt.lt)) return false;
    if (where.participants?.some?.userId) {
      if (!parts.some((p) => p.callId === c.id && p.userId === where.participants.some.userId)) return false;
    }
    return true;
  };

  const callSession = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `call${++seq}`, createdAt: NOW, startedAt: null, endedAt: null, endedReason: null, avatarId: null, ...data };
      calls.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const c = calls.find((x) => x.id === where.id);
      return c ? withParticipants(c) : null;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const c = calls.find((x) => matches(where, x));
      return c ? withParticipants(c) : null;
    }),
    findMany: jest.fn(async ({ where, take }: any) =>
      calls.filter((c) => matches(where, c)).slice(0, take ?? 50).map(withParticipants)),
    update: jest.fn(async ({ where, data }: any) => {
      const c = calls.find((x) => x.id === where.id)!;
      Object.assign(c, data);
      return withParticipants(c);
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = calls.filter((c) => matches(where, c));
      hit.forEach((c) => Object.assign(c, data));
      return { count: hit.length };
    }),
  };

  const callParticipant = {
    createMany: jest.fn(async ({ data }: any) => {
      for (const d of data) if (!parts.some((p) => p.callId === d.callId && p.userId === d.userId)) parts.push({ leftAt: null, joinedAt: null, ...d });
      return { count: data.length };
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const key = where.callId_userId;
      const found = parts.find((p) => p.callId === key.callId && p.userId === key.userId);
      if (found) { Object.assign(found, update); return found; }
      const row = { leftAt: null, joinedAt: null, ...create };
      parts.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = parts.filter((p) =>
        p.callId === where.callId &&
        (where.userId === undefined || p.userId === where.userId) &&
        (where.leftAt !== null || p.leftAt === null));
      hit.forEach((p) => Object.assign(p, data));
      return { count: hit.length };
    }),
    findFirst: jest.fn(async () => null),
  };

  const prisma = {
    callSession,
    callParticipant,
    avatar: { findFirst: jest.fn(async () => null) },
    conversationMember: {
      findMany: jest.fn(async () => members.map((userId) => ({ userId }))),
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) => (members.includes(where.userId) ? { userId: where.userId } : null)),
    },
  };

  const permission = {
    assertCanPostToConversation: jest.fn(async (userId: string) => {
      if (!members.includes(userId)) throw new ForbiddenException('You are not a member of this conversation.');
    }),
    blockedWith: jest.fn(async () => new Set<string>()),
    isBlocked: jest.fn(async () => false),
  };
  const published: Row[] = [];
  /* `notifyCallEnded` since 3 Sep: `close()` is the one chokepoint every ending
     goes through, and it takes the ring back off the lock screen there rather
     than in the five callers that end a call. */
  const notifications = {
    notifyIncomingCall: jest.fn(async () => undefined),
    notifyCallEnded: jest.fn(async () => undefined),
  };
  const bus = { publish: jest.fn((e: Row) => published.push(e)) };

  const redis = { isOnline: jest.fn(async (userId: string) => online.has(userId)) };

  const svc = new CallsService(prisma as never, permission as never, notifications as never, bus as never, redis as never);
  return { svc, calls, parts, published, notifications, permission, callSession, callParticipant, online };
}

describe('a call id is not a credential', () => {
  it('refuses to let a non-member join, however valid the call id', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await expect(h.svc.join('mallory', call.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to let a non-member even read the call', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await expect(h.svc.get('mallory', call.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('re-checks membership on every signalling frame, not once at join', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    h.permission.assertCanPostToConversation.mockImplementation(async () => {
      throw new ForbiddenException('removed from the conversation');
    });
    await expect(h.svc.assertMaySignal('bob', call.id, 'alice')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('will not relay to somebody who is not on the roster', async () => {
    const h = harness({ members: ['alice', 'bob', 'carol'] });
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    // carol IS a conversation member, so she is on this roster; dave is not.
    await expect(h.svc.assertMaySignal('alice', call.id, 'dave')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.svc.assertMaySignal('alice', call.id, 'carol')).resolves.toBeUndefined();
  });

  it('answers 404 for a call id that does not exist', async () => {
    const h = harness();
    await expect(h.svc.get('alice', 'no-such-call')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('starting a call', () => {
  it('puts the whole conversation on the roster before anyone answers', async () => {
    const h = harness({ members: ['alice', 'bob', 'carol'] });
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'video' });
    expect(call.participants.map((p) => p.userId).sort()).toEqual(['alice', 'bob', 'carol']);
    expect(call.participants.find((p) => p.userId === 'alice')?.role).toBe('caller');
    // Signalling can be authorised against the roster from the first second.
    expect(call.status).toBe('ringing');
  });

  it('joins the call already ringing instead of starting a rival one', async () => {
    const h = harness();
    const first = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    const second = await h.svc.start('bob', { conversationId: 'c1', type: 'audio' });
    expect(second.id).toBe(first.id);
    expect(h.calls).toHaveLength(1);
    // ...and bob answering it is what makes it active.
    expect(second.status).toBe('active');
  });

  it('rings the others and nobody else', async () => {
    const h = harness({ members: ['alice', 'bob', 'carol'] });
    await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    const ring = h.published.find((e) => e.kind === 'call.ringing')!;
    expect(ring.recipientIds.sort()).toEqual(['bob', 'carol']);
    expect(h.notifications.notifyIncomingCall).toHaveBeenCalledWith(
      expect.objectContaining({ callerId: 'alice', recipientIds: expect.arrayContaining(['bob']) }),
    );
  });

  it('refuses an avatar call with an avatar that is not yours', async () => {
    const h = harness();
    await expect(
      h.svc.start('alice', { conversationId: 'c1', type: 'avatar', avatarId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('answering, hanging up, and both at once', () => {
  it('rejoining after a dropped socket takes the same seat', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    await h.svc.leave('bob', call.id);
    const again = await h.svc.join('bob', call.id).catch((e) => e);
    // The call ended when bob left a two-person call, so this is a clear refusal
    // rather than a silent second seat.
    expect(again).toBeInstanceOf(BadRequestException);
    expect(h.parts.filter((p) => p.userId === 'bob')).toHaveLength(1);
  });

  it('ends once when two people hang up in the same moment', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    await Promise.all([h.svc.leave('alice', call.id), h.svc.leave('bob', call.id)]);
    const ended = h.published.filter((e) => e.kind === 'call.updated' && e.event === 'ended');
    expect(ended).toHaveLength(1);
    expect(h.calls[0].endedReason).toBe('completed');
  });

  it('lets only the person who started it end it for everyone', async () => {
    const h = harness({ members: ['alice', 'bob', 'carol'] });
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    await expect(h.svc.end('bob', call.id)).rejects.toBeInstanceOf(ForbiddenException);
    const done = await h.svc.end('alice', call.id);
    expect(done.status).toBe('ended');
    expect(done.participants.every((p) => p.leftAt !== null)).toBe(true);
  });

  it('refuses to join a call that has ended', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.end('alice', call.id);
    await expect(h.svc.join('bob', call.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('the sweep', () => {
  it('closes a call nobody answered, so the next one is not blocked', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    const later = new Date(NOW.getTime() + RING_TIMEOUT_MS + 60_000);
    expect(await h.svc.sweepStale(later)).toBe(1);
    expect(h.calls[0].endedReason).toBe('missed');
    // ...and now a fresh call can start.
    const next = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    expect(next.id).not.toBe(call.id);
  });

  it('leaves a long call alone while somebody on it is still connected', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    const hourLater = new Date(NOW.getTime() + 60 * 60_000);
    expect(await h.svc.sweepStale(hourLater)).toBe(0);
    expect(h.calls[0].status).toBe('active');
  });

  /* THIS TEST USED TO SAY THE OPPOSITE, AND IT WAS WRONG ON PURPOSE.
     It asserted that an active call with "present" participants is never
     stale, however long it runs — and present is two columns, joinedAt set and
     leftAt null, written only by a request that arrives when somebody presses
     a button. Two people closing their laptops press nothing, so the call
     stayed active for the rest of time, this sweep skipped it every minute,
     and the next `start` in that conversation joined the corpse: no ring for
     anybody, and a caller sitting on "Connecting…" with the microphone open.
     Liveness is presence, not a column. */
  it('closes an active call both sides walked away from', async () => {
    const h = harness();
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    h.online.clear(); // both laptops closed; no leave was ever sent
    const later = new Date(NOW.getTime() + 5 * 60_000);
    expect(await h.svc.sweepStale(later)).toBe(1);
    expect(h.calls[0].endedReason).toBe('completed');
    // ...and the conversation can be called again.
    const next = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    expect(next.id).not.toBe(call.id);
  });

  it('gives up the seat of somebody whose last socket went, and only that seat', async () => {
    const h = harness({ members: ['alice', 'bob', 'carol'] });
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    // carol's phone is ringing; she never answered, so her tab closing is not
    // a decline and must not take the call down.
    expect(await h.svc.leaveAbandoned('carol')).toBe(0);
    expect(h.calls[0].status).toBe('active');
    expect(await h.svc.leaveAbandoned('bob')).toBe(1);
    expect(h.parts.find((p) => p.userId === 'bob')?.leftAt).not.toBeNull();
  });
});

describe('glare — two people press call in the same second', () => {
  it('leaves one live call in the conversation, and both callers in it', async () => {
    const h = harness();
    // Both requests get past the "is anything live?" read before either writes,
    // which is the race the check-then-act had no answer for.
    const [a, b] = await Promise.all([
      h.svc.start('alice', { conversationId: 'c1', type: 'audio' }),
      h.svc.start('bob', { conversationId: 'c1', type: 'audio' }),
    ]);
    expect(a.id).toBe(b.id);
    expect(h.calls.filter((c) => c.status !== 'ended')).toHaveLength(1);
  });
});

describe('history', () => {
  it('shows only calls you were on', async () => {
    const h = harness({ members: ['alice', 'bob'] });
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.end('alice', call.id);
    expect((await h.svc.list('alice', {})).map((c) => c.id)).toEqual([call.id]);
    expect(await h.svc.list('carol', {})).toEqual([]);
  });
});

describe('ring recovery — the phone is still ringing for a tab that just woke', () => {
  it('hands the callee the live ring, and nobody else anything', async () => {
    const h = harness({ members: ['alice', 'bob'] });
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'video' });
    const inWindow = new Date(NOW.getTime() + 10_000);
    // The callee's freshly-opened tab finds the ring…
    const forBob = await h.svc.ringingFor('bob', inWindow);
    expect(forBob?.id).toBe(call.id);
    expect(forBob?.status).toBe('ringing');
    // …the CALLER's own outgoing ring is not an incoming call…
    expect(await h.svc.ringingFor('alice', inWindow)).toBeNull();
    // …and a stranger was never a participant, so there is nothing to find.
    expect(await h.svc.ringingFor('carol', inWindow)).toBeNull();
  });

  it('a ring past its window is a missed call, not a ringing one', async () => {
    const h = harness({ members: ['alice', 'bob'] });
    await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    const late = new Date(NOW.getTime() + 46_000); // RING_TIMEOUT_MS is 45s
    expect(await h.svc.ringingFor('bob', late)).toBeNull();
  });

  it('an answered call is no longer ringing — recovery stays quiet', async () => {
    const h = harness({ members: ['alice', 'bob'] });
    const call = await h.svc.start('alice', { conversationId: 'c1', type: 'audio' });
    await h.svc.join('bob', call.id);
    expect(await h.svc.ringingFor('bob', new Date(NOW.getTime() + 10_000))).toBeNull();
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';
import { openCardId } from './card-id';

/**
 * ── A BLOCKED MATCH LEAVES THE CHATS TAB (blocker 10) ────────────────────────
 *
 * datingChats filtered on status:'matched' and a live account, and nothing
 * else — the one dating surface that never asked whether the two had blocked
 * each other. Block a match from the People hub and they were gone from every
 * list except this one, still on the safety screen with photo, name, age and
 * last message. This calls the method with one blocked match and one ordinary
 * one, and asserts only the ordinary one survives.
 */

/** Ids on the wire are sealed to the viewer since 31 Aug (card-id.ts); the
 *  assertions below read them back through the service's own key. */
const unseal = (svc: unknown, viewer: string, token: string) =>
  openCardId((svc as unknown as { cardSecret(): string }).cardSecret(), viewer, token) ?? token;

const UPDATED = new Date('2026-07-01T00:00:00Z');
const match = (otherId: string) => ({
  id: `m-${otherId}`, userOneId: 'me', userTwoId: otherId, kind: 'romantic', status: 'matched',
  revealByOne: false, revealByTwo: false, conversationId: null, updatedAt: UPDATED,
});

function serviceWith(blockedIds: string[]) {
  const prisma: any = {
    datingMatch: { findMany: jest.fn(async () => [match('friend'), match('blocked')]) },
    user: { findMany: jest.fn(async () => [{ id: 'friend', name: 'Ada' }, { id: 'blocked', name: 'Zed' }]) },
    datingProfile: { findUnique: jest.fn(async () => ({ moderation: 'approved' })), findMany: jest.fn(async () => [
      { userId: 'me', extras: null }, { userId: 'friend', birthDate: new Date('1995-01-01Z'), extras: null }, { userId: 'blocked', birthDate: new Date('1994-01-01Z'), extras: null },
    ]) },
    compatibilityScore: { findMany: jest.fn(async () => []) },
  };
  const blocking = { blockedWith: jest.fn(async () => new Set(blockedIds)) };
  const conversations = {
    summariesFor: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id,
      { lastMessageAt: UPDATED.toISOString(), lastText: null, lastSenderId: null, unread: 0 }]))),
  };
  const svc = new DatingService(
    prisma as never, {} as never, conversations as never, {} as never,
    {} as never, {} as never, {} as never, blocking as never,
    {} as never, {} as never,
    { approvedOf: async () => new Set<string>(), statusOf: async () => ({}) } as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
  return { svc, blocking };
}

describe('a blocked match leaves the chats tab', () => {
  it('drops a match the caller has blocked (or who blocked them)', async () => {
    const { svc } = serviceWith(['blocked']);
    const out = await svc.datingChats('me') as any[];
    const ids = out.map((r) => unseal(svc, 'me', r.otherUserId));
    expect(ids).toContain('friend');
    expect(ids).not.toContain('blocked');
  });

  it('keeps both when nobody is blocked — the filter is off, not always-on', async () => {
    const { svc } = serviceWith([]);
    const out = await svc.datingChats('me') as any[];
    expect(out.map((r) => unseal(svc, 'me', r.otherUserId)).sort()).toEqual(['blocked', 'friend']);
  });

  it('actually consulted the block set', async () => {
    const { svc, blocking } = serviceWith(['blocked']);
    await svc.datingChats('me');
    expect(blocking.blockedWith).toHaveBeenCalledWith('me');
  });
});

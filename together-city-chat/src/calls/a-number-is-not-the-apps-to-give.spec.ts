import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CallsService } from './calls.service';
import { reachOf } from './reach';

/**
 * A NUMBER IS NOT THE APP'S TO GIVE.
 *
 * The call keys in a chat header now hand off to the handset — the dialler for
 * voice, the WhatsApp thread for video — which means the page asks this service
 * for the other person's telephone number. Nothing in this city has ever
 * answered that question before, so these are the tests for the answer being
 * NO, and they outnumber the one for yes on purpose.
 *
 * The case that matters most is the dating one, and it is the one a later
 * change is most likely to break by accident: `anonymousTrust` reaching 3 means
 * two people agreed to be friends, which reads like consent and is not. It is
 * consent to a name and a face inside this app. A telephone number leaves the
 * app, survives the unmatch, and is in a stranger's contacts forever.
 */

const VERIFIED = new Date('2026-01-01T00:00:00Z');

function harness(opts: {
  members?: string[];
  conversation?: { type: string; kind: string; anonymousTrust: number | null } | null;
  users?: Record<string, { phoneE164: string | null; phoneVerifiedAt: Date | null; deletedAt: Date | null }>;
} = {}) {
  const members = opts.members ?? ['alice', 'bob'];
  const users = opts.users ?? {
    alice: { phoneE164: '+919812345678', phoneVerifiedAt: VERIFIED, deletedAt: null },
    bob: { phoneE164: '+919876543210', phoneVerifiedAt: VERIFIED, deletedAt: null },
  };
  const conversation = opts.conversation === undefined
    ? { type: 'DIRECT', kind: 'city', anonymousTrust: null }
    : opts.conversation;

  const prisma = {
    conversation: { findUnique: jest.fn(async () => conversation) },
    conversationMember: {
      findMany: jest.fn(async ({ where }: { where: { userId?: { not?: string } } }) => members
        .filter((id) => id !== where.userId?.not)
        .map((id) => ({ user: users[id] ?? { phoneE164: null, phoneVerifiedAt: null, deletedAt: null } }))),
    },
  };
  const permission = {
    assertCanPostToConversation: jest.fn(async (userId: string) => {
      if (!members.includes(userId)) throw new ForbiddenException('You are not a member of this conversation.');
    }),
  };
  const svc = new CallsService(prisma as never, permission as never, {} as never, {} as never, {} as never);
  return { svc, permission };
}

describe('a number is not the app\'s to give', () => {
  it('gives the other person\'s verified number in an ordinary two-person chat', async () => {
    const { svc } = harness();
    expect(await svc.reach('alice', 'c1')).toEqual({ phoneE164: '+919876543210', reason: null });
  });

  it('never gives the asker their own number back', async () => {
    const { svc } = harness();
    expect((await svc.reach('bob', 'c1')).phoneE164).toBe('+919812345678');
    expect((await svc.reach('alice', 'c1')).phoneE164).not.toBe('+919812345678');
  });

  it('refuses somebody who is not in the conversation', async () => {
    const { svc } = harness();
    await expect(svc.reach('mallory', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 404 for a conversation that does not exist', async () => {
    const { svc } = harness({ conversation: null });
    await expect(svc.reach('alice', 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('asks permission BEFORE it looks anything up', async () => {
    // Ordering, not politeness: a lookup that runs first is a lookup a
    // non-member has already caused, whatever is thrown afterwards.
    const { svc, permission } = harness();
    await svc.reach('alice', 'c1');
    expect(permission.assertCanPostToConversation).toHaveBeenCalledWith('alice', 'c1');
  });
});

describe('the rooms that never yield a number', () => {
  it('refuses every dating chat, at every level of trust', () => {
    for (const anonymousTrust of [1, 2, 3]) {
      expect(reachOf({ type: 'DIRECT', kind: 'dating', anonymousTrust }, [
        { phoneE164: '+919876543210', phoneVerifiedAt: VERIFIED, deletedAt: null },
      ])).toEqual({ phoneE164: null, reason: 'dating' });
    }
  });

  /* IT IS THE `kind` COLUMN THAT SAYS SO, NOT THE TRUST LEVEL.
     `anonymousTrust` was the proxy, and a real-estate enquiry sets it too —
     so an enquiry about a flat was refused with reason 'dating', which is a
     false statement about the citizen made by the API. Both rooms still
     withhold the number; they no longer withhold it under each other's name. */
  it('refuses an anonymous enquiry too, and does not call it dating', () => {
    expect(reachOf({ type: 'DIRECT', kind: 'city', anonymousTrust: 1 }, [
      { phoneE164: '+919876543210', phoneVerifiedAt: VERIFIED, deletedAt: null },
    ])).toEqual({ phoneE164: null, reason: 'anonymous' });
  });

  it('refuses a dating chat on the strength of its own row, trust or none', () => {
    expect(reachOf({ type: 'DIRECT', kind: 'dating', anonymousTrust: null }, [
      { phoneE164: '+919876543210', phoneVerifiedAt: VERIFIED, deletedAt: null },
    ])).toEqual({ phoneE164: null, reason: 'dating' });
  });

  it('refuses a group, because there is no "the other person"', () => {
    expect(reachOf({ type: 'GROUP', kind: 'city', anonymousTrust: null }, [
      { phoneE164: '+919876543210', phoneVerifiedAt: VERIFIED, deletedAt: null },
      { phoneE164: '+919811111111', phoneVerifiedAt: VERIFIED, deletedAt: null },
    ])).toEqual({ phoneE164: null, reason: 'group' });
  });

  it('refuses a deleted account, and an empty room', () => {
    expect(reachOf({ type: 'DIRECT', kind: 'city', anonymousTrust: null }, [
      { phoneE164: '+919876543210', phoneVerifiedAt: VERIFIED, deletedAt: new Date() },
    ]).reason).toBe('nobody');
    expect(reachOf({ type: 'DIRECT', kind: 'city', anonymousTrust: null }, []).reason).toBe('nobody');
  });

  it('refuses a number nobody has proved, however well-formed', () => {
    expect(reachOf({ type: 'DIRECT', kind: 'city', anonymousTrust: null }, [
      { phoneE164: '+919876543210', phoneVerifiedAt: null, deletedAt: null },
    ])).toEqual({ phoneE164: null, reason: 'unverified' });
  });

  it('refuses everything that is not E.164, including what the column may hold', () => {
    // The schema says so itself: a number typed before that column was E.164
    // may not parse. Each of these would have become a tel: href.
    for (const phoneE164 of [
      null, '', '   ',
      '9876543210',        // no country code — dials somebody in the caller's country
      '+0119876543210',    // leading zero after the plus
      '098765 43210',      // as typed, which is what User.phone is FOR
      '+91 98765 43210',   // spaced
      '+91-9876-543210',   // hyphenated
      'call me',           // free text in a nullable string column
      '+911234',           // too short to be a subscriber number
      '+9198765432109876', // too long to be one
    ]) {
      expect({ phoneE164, reach: reachOf({ type: 'DIRECT', kind: 'city', anonymousTrust: null }, [
        { phoneE164, phoneVerifiedAt: VERIFIED, deletedAt: null },
      ]) }).toEqual({ phoneE164, reach: { phoneE164: null, reason: 'unverified' } });
    }
  });
});

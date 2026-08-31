/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ProfileService } from '../profile/profile.service';

/**
 * ── A BLOCK IS NOT A SUGGESTION ─────────────────────────────────────────────
 *
 * The 31 Aug audit found three surfaces where a blocked citizen was still
 * offered, and the codebase had already written down that they should not be.
 * `blocking.ts`, in the docblock explaining why the unblock advice points at
 * Settings rather than a profile:
 *
 *     blocking somebody removes them from the feed, from search and from your
 *     circle, so their profile is the one page you can no longer reach
 *
 * The feed was true. Search, the circle and the profile were not. That
 * paragraph is a specification nobody had turned into code, which is a
 * particular kind of gap: everyone who read the file believed the rule held.
 *
 * The root of all three is that `block()` writes a Block row and severs the
 * follow edges, and deliberately does NOT touch an existing ACCEPTED
 * connection — the two are different facts, and unblocking must not have to
 * guess what the connection used to be. Every list that filtered on connection
 * status alone therefore kept the blocked person.
 *
 * The share sheet is where it stopped being merely wrong: a blocked citizen was
 * offered as somebody to send a card to, and `startDirect` would then refuse
 * with "not accepting messages right now". Offering an action we have already
 * decided to forbid is worse than not offering it.
 */

const ME = 'me-0000';
const THEM = 'them-1111';
const OK = 'okay-2222';

const person = (id: string) => ({ id, handle: id.split('-')[0], name: id, profileImage: null });
const conn = (other: string) => ({
  id: `c-${other}`, userOneId: ME, userTwoId: other, status: 'ACCEPTED', connectionType: 'FRIEND',
  requestedById: ME, relationship: null, modulesJson: JSON.stringify(['social']),
  userOne: person(ME), userTwo: person(other), updatedAt: new Date(),
});

describe('a blocked citizen is not on the People page or in the share sheet', () => {
  const svc = (blocked: string[]) => new ConnectionsService(
    { connection: { findMany: async () => [conn(THEM), conn(OK)] } } as any,
    {} as never, {} as never,
    { blockedWith: async () => new Set(blocked) } as any,
  );

  it('drops them from listForUser, which is the People page', async () => {
    const out = await svc([THEM]).listForUser(ME);
    expect(out.map((c) => c.user.id)).toEqual([OK]);
  });

  it('drops them from recipients, which is the share sheet on every hub', async () => {
    // The harmful one: offered as somebody to send to, and startDirect would
    // then refuse. An app must not invite what it has decided to forbid.
    const out = await svc([THEM]).recipients(ME);
    expect(out.map((r) => r.id)).toEqual([OK]);
  });

  it('drops them from listForModule too — one filter, three surfaces', async () => {
    const out = await svc([THEM]).listForModule(ME, 'social');
    expect(out.map((c) => c.user.id)).toEqual([OK]);
  });

  it('keeps everybody when nothing is blocked', async () => {
    // Otherwise "the blocked one is gone" is true of a method that returns
    // nothing at all.
    const out = await svc([]).listForUser(ME);
    expect(out.map((c) => c.user.id).sort()).toEqual([OK, THEM].sort());
  });
});

describe('a blocked citizen is not somebody to start a chat with', () => {
  const svc = (blocked: string[]) => new ConversationsService(
    { connection: { findMany: async () => [conn(THEM), conn(OK)] } } as any,
    { blockedWith: async () => new Set(blocked) } as any,
  );

  it('leaves them out of the chat contacts list', async () => {
    expect((await svc([THEM]).contacts(ME)).map((c) => c.id)).toEqual([OK]);
  });

  it('keeps everybody when nothing is blocked', async () => {
    expect((await svc([]).contacts(ME)).map((c) => c.id).sort()).toEqual([OK, THEM].sort());
  });
});

describe('a blocked citizen cannot read your profile or find you', () => {
  const svc = (blocked: boolean) => new ProfileService(
    {
      user: {
        findUnique: async () => ({
          id: THEM, handle: 'them', name: 'Them', email: 'x@y.z', profileImage: null,
          emailVerified: true, createdAt: new Date(), bio: 'my bio', city: 'Pune',
          website: null, deletedAt: null,
        }),
        findMany: async (a: any) => {
          seen.push(a.where);
          return [{ id: THEM, handle: 'them', name: 'Them', profileImage: null, city: 'Pune', emailVerified: true }];
        },
      },
      connection: { findFirst: async () => null, findMany: async () => [] },
      follow: { findUnique: async () => null, findMany: async () => [] },
      post: { count: async () => 0 },
      like: { count: async () => 0 },
      comment: { count: async () => 0 },
    } as any,
    {} as never, {} as never,
    { isBlocked: async () => blocked, blockedWith: async () => new Set(blocked ? [THEM] : []) } as any,
    {} as never, {} as never,
  );
  const seen: any[] = [];
  beforeEach(() => { seen.length = 0; });

  it('answers a blocked pair exactly as it answers a handle that never existed', async () => {
    // A different sentence would tell the reader that a specific citizen
    // exists and has shut them out — the one fact a block is meant not to
    // hand over.
    await expect(svc(true).publicProfile(ME, 'them')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc(true).publicProfile(ME, 'them')).rejects.toThrow('No citizen with that handle.');
  });

  it('still serves the profile when nobody is blocked', async () => {
    const out = await svc(false).publicProfile(ME, 'them');
    expect(out.handle).toBe('them');
    expect(out.bio).toBe('my bio');
  });

  it('excludes blocked citizens from People search, in the query not afterwards', async () => {
    // Filtering twelve results after the fact would quietly return eleven —
    // so the exclusion has to be in the where.
    await svc(true).searchPeople(ME, 'the');
    expect(seen[0].id).toEqual({ not: ME, notIn: [THEM] });
  });

  it('does not add an empty notIn when nothing is blocked', async () => {
    await svc(false).searchPeople(ME, 'the');
    expect(seen[0].id).toEqual({ not: ME });
  });
});

describe('a change to a connection is true immediately', () => {
  /**
   * SocialService caches the viewer's graph for thirty seconds and drops it on
   * follow, unfollow and block — all of which live in SocialService or
   * BlockingService. The edges ConnectionsService changes were the ones nobody
   * dropped: accepting, declining, removing, and changing which hubs a
   * connection grants.
   *
   * The last became the sharp one on 31 Aug, when the feed's friends circle
   * started reading `modulesJson` so the Social checkbox governs the feed as
   * well as the profile grid. Unticking it took effect up to thirty seconds
   * late — and a stale grant fails OPEN, the wrong direction for a control
   * whose only purpose is to shut somebody out.
   */
  it('drops both citizens’ cached graphs whenever it broadcasts', () => {
    const dropped: string[] = [];
    const svc = new ConnectionsService(
      {} as never, { permissionsChanged: () => undefined } as any, {} as never, {} as never,
      { dropGraph: (...ids: string[]) => dropped.push(...ids.filter(Boolean)) } as any,
    );
    (svc as any).broadcast({ id: 'c1', userOneId: ME, userTwoId: THEM, status: 'ACCEPTED', modulesJson: null });
    expect(dropped).toEqual([ME, THEM]);
  });

  it('works without a cache at all, which is how every spec builds it', () => {
    const svc = new ConnectionsService(
      {} as never, { permissionsChanged: () => undefined } as any, {} as never, {} as never,
    );
    expect(() => (svc as any).broadcast({ id: 'c1', userOneId: ME, userTwoId: THEM, status: 'ACCEPTED', modulesJson: null })).not.toThrow();
  });
});

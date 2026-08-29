/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { SocialService } from './social.service';
import { NutritionService } from '../nutrition/nutrition.service';

/**
 * ── A DATING ID BUYS YOU NOTHING (second dating audit, blocker 02) ───────────
 *
 * A Dating card carries the other person's raw `User.id`. It has to: every
 * action on that card — like, pass, reveal, block, open the chat — is keyed by
 * it. The card itself is careful. It shows a chosen first name and nothing
 * else: no @handle, no account photograph, and `cardIdentity()` has a spec of
 * its own that says so.
 *
 * All of which is worth exactly as much as the id is inert. It was not. Four
 * endpoints elsewhere in the city took a raw `User.id` as an alternative
 * lookup key and handed back the city identity behind it:
 *
 *   1. POST /social/follow  {userId}  → GET /social/following   (name/handle/photo)
 *   2. POST /social/block   {userId}  → GET /social/blocks      (name/handle/photo)
 *   3. GET  /nutrition/family/search?q=<id>   → in the same reply
 *   4. POST /nutrition/family/invite {userRef: <id>} → in the same reply
 *
 * And a fifth that used no id at all: block your anonymous match from the card
 * — a supported, encouraged safety action — then open Settings → Blocked
 * citizens, where the shared Block table drew them under their account name
 * and @handle. That one was a button.
 *
 * THIS FILE CALLS THE METHODS. Nine dating specs in this repo read their own
 * source with `readFileSync` and match a regex, which asserts that a line was
 * written, not that a behaviour holds — every blocker in the audit had a green
 * test of that kind sitting beside it. So: real service objects, an in-memory
 * Prisma, a raw uuid in, and an assertion about what comes back out.
 */

const DATER = '11111111-2222-3333-4444-555555555555';

type U = { id: string; handle: string; name: string; profileImage: string | null };
const CARLA: U = { id: DATER, handle: 'carla', name: 'Carla Whitfield-Osei', profileImage: 'https://x/c.jpg' };

/**
 * An honest little Prisma matcher. The first draft of this file stubbed
 * `user.findFirst` as "return Carla if where.handle is hers" — which made every
 * raw-id assertion below pass against the UNFIXED code, because the stub was
 * not looking at the id either. A fake that cannot express the bug cannot test
 * the fix. So this reads `{ id }`, `{ handle }` and `OR: [...]` the way the
 * real client does, and the specs were run against both versions of the
 * service to check they fail on the old one.
 */
const matches = (where: unknown, u: U): boolean => {
  const w = where as Record<string, unknown> | null | undefined;
  if (!w) return false;
  if (Array.isArray(w.OR)) return w.OR.some((each) => matches(each, u));
  const keys = Object.keys(w);
  return keys.length > 0 && keys.every((k) => (u as unknown as Record<string, unknown>)[k] === w[k]);
};

// ─────────────── social ───────────────

function socialStub(over: Record<string, unknown> = {}) {
  const follows: Array<{ followerId: string; followeeId: string }> = [];
  const prisma = {
    user: {
      findFirst: async ({ where }: any) => (matches(where, CARLA) ? { ...CARLA } : null),
      findUnique: async () => ({ name: 'Me' }),
    },
    follow: {
      findUnique: async () => null,
      createMany: async ({ data }: any) => { follows.push(...data); return { count: data.length }; },
    },
    ...over,
  } as any;
  return { prisma, follows };
}

const notifications = { create: jest.fn(async () => undefined) };
// `blockedWith` joined this stub on 30 Aug: `follow` now consults the block set
// before writing an edge, so a block survives a re-follow. Empty here — these
// specs are about identity leaks, not blocks, and an empty set is the case that
// lets the follow through.
const blocking = {
  block: jest.fn(async (_me: string, them: string) => ({ blocked: true as const, userId: them })),
  blockedWith: jest.fn(async () => new Set<string>()),
};

const social = (prisma: any) =>
  new SocialService(prisma, {} as never, notifications as never, {} as never, {} as never, blocking as never, {} as never);

describe('a dating id buys you nothing', () => {
  beforeEach(() => { notifications.create.mockClear(); blocking.block.mockClear(); });

  it('follow refuses a raw user id, and writes nothing', async () => {
    const { prisma, follows } = socialStub();
    await expect(social(prisma).follow('me', DATER)).rejects.toBeInstanceOf(NotFoundException);
    expect(follows).toHaveLength(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('follow still works by handle — the door is closed, not bricked up', async () => {
    const { prisma, follows } = socialStub();
    const out = await social(prisma).follow('me', '@Carla');
    expect(out).toEqual({ following: true, userId: DATER });
    expect(follows).toEqual([{ followerId: 'me', followeeId: DATER }]);
  });

  it('block refuses a raw user id, and blocks nobody', async () => {
    const { prisma } = socialStub();
    await expect(social(prisma).block('me', DATER)).rejects.toBeInstanceOf(NotFoundException);
    expect(blocking.block).not.toHaveBeenCalled();
  });

  it('block still works by handle', async () => {
    const { prisma } = socialStub();
    await expect(social(prisma).block('me', 'carla')).resolves.toEqual({ blocked: true, userId: DATER });
    expect(blocking.block).toHaveBeenCalledWith('me', DATER);
  });
});

// ─────────────── the block list ───────────────

function blockListStub(opts: { extras?: string; connected?: boolean; dating?: boolean }) {
  return {
    block: { findMany: async () => [{ blockerId: 'me', blockedId: DATER, blocked: { ...CARLA } }] },
    datingProfile: {
      findMany: async () => (opts.dating === false ? [] : [{ userId: DATER, extras: opts.extras ?? '{"firstName":"Cee"}' }]),
    },
    connection: {
      findMany: async () => (opts.connected ? [{ userOneId: 'me', userTwoId: DATER }] : []),
    },
  } as any;
}

describe('blocking a match is not a way of asking who they are', () => {
  it('a dating-only person keeps their dating name and loses their handle and photo', async () => {
    const [row] = await social(blockListStub({})).listBlocks('me');
    expect(row).toEqual({ id: DATER, name: 'Cee', handle: null, profileImage: null });
  });

  it('never falls back to the account name when the dating name is missing', async () => {
    const [row] = await social(blockListStub({ extras: '{}' })).listBlocks('me');
    expect(row.name).not.toContain('Carla');
    expect(row.name).not.toContain('Whitfield');
    expect(row.handle).toBeNull();
  });

  it('an unreadable extras blob still names nobody', async () => {
    const [row] = await social(blockListStub({ extras: 'not json at all' })).listBlocks('me');
    expect(row.name).not.toContain('Carla');
    expect(row.handle).toBeNull();
  });

  it('a connection is drawn in full — you already know them', async () => {
    const [row] = await social(blockListStub({ connected: true })).listBlocks('me');
    expect(row).toEqual(CARLA);
  });

  it('somebody with no dating profile is drawn in full', async () => {
    const [row] = await social(blockListStub({ dating: false })).listBlocks('me');
    expect(row).toEqual(CARLA);
  });
});

// ─────────────── nutrition ───────────────

const nutritionStub = () => ({
  user: { findFirst: async ({ where }: any) => (matches(where, CARLA) ? { ...CARLA } : null) },
  householdMember: { findUnique: async () => null, findFirst: async () => null },
} as any);

const nutrition = (prisma: any) =>
  new NutritionService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

describe('the household search is not an identity oracle', () => {
  it('a raw user id finds nobody', async () => {
    await expect(nutrition(nutritionStub()).searchHouseholdUser('owner', DATER))
      .resolves.toEqual({ found: false });
  });

  it('and the reply carries no name, handle or photograph to read', async () => {
    const out = await nutrition(nutritionStub()).searchHouseholdUser('owner', DATER) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain('Carla');
    expect(JSON.stringify(out)).not.toContain('carla');
  });

  it('inviting by a raw user id is refused before anything is written', async () => {
    await expect(nutrition(nutritionStub()).inviteHousehold('owner', DATER, 'adult'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('a @username still finds them — this is the key the copy always described', async () => {
    const out = await nutrition(nutritionStub()).searchHouseholdUser('owner', '@carla');
    expect(out).toMatchObject({ found: true, relationship: 'none', user: { id: DATER, handle: 'carla' } });
  });
});

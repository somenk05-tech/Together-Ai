/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { DatingService } from './dating.service';
import { fallbackHandle, handleProblem, normaliseHandle } from './dating-handle';

/**
 * ── THE NAME YOU DATE UNDER ─────────────────────────────────────────────────
 *
 * A citizen's Dating presence gets an identifier they choose when the profile
 * is created. Before this there were two names for one person and neither was
 * chosen as an identifier: a display name (which two matches can share) and,
 * inside an anonymous chat, `nickname(userId)` — "Coastal Ember", out of a
 * hash, that the citizen never saw on their own profile and could not change.
 *
 * Three properties, and every one of them is a way the city could leak back in:
 *
 *   1. A dating handle is NEVER a name an account already holds. Otherwise
 *      `@maya` in a chat resolves, on the public web, to a City profile — the
 *      wrong Maya if it is somebody else's, and self-deanonymisation if it is
 *      their own.
 *   2. Two citizens never share one. The unique index is the backstop; this is
 *      the sentence they get instead of a 500.
 *   3. The generated fallback and the chosen namespace do not overlap, so a
 *      profile that has not chosen cannot collide with one that has — and no
 *      unique index would catch it, because the fallback is computed rather
 *      than stored.
 *
 * These call the method. The shape rules are pure and tested directly; the two
 * that need the database are exercised through `upsertProfile`'s own claim.
 */

const CITY_HANDLE = 'maya';
const ME = 'me-uuid';
const OTHER = 'other-uuid';

// The private claim, reached the way the service reaches it.
const claim = (svc: DatingService, userId: string, want: string, current: string | null) =>
  (svc as unknown as {
    claimDatingHandle(u: string, raw: string, cur: string | null): Promise<string>;
  }).claimDatingHandle(userId, want, current);

function service(opts: { cityHandles?: string[]; datingHandles?: Array<[string, string]> } = {}) {
  const city = new Set(opts.cityHandles ?? []);
  const dating = new Map(opts.datingHandles ?? []);
  const prisma = {
    user: {
      findFirst: async ({ where }: any) => (city.has(where?.handle) ? { id: 'city-user' } : null),
    },
    datingProfile: {
      findFirst: async ({ where }: any) => {
        const owner = dating.get(where?.handle);
        return owner ? { userId: owner } : null;
      },
    },
  } as any;
  // Fifteen, because the constructor takes fifteen. The first draft passed
  // twenty and jest never noticed — extra arguments are free at runtime — so
  // this file was green for an hour with a type error in it. tsc caught it on
  // the way in, which is the whole reason tsc runs before jest in the landing
  // script and not after.
  const nothing = {} as never;
  return new DatingService(
    prisma, nothing, nothing, nothing, nothing, nothing, nothing, nothing,
    nothing, nothing, nothing, nothing, nothing, nothing, nothing,
  );
}

describe('the shape of a dating name', () => {
  it('takes what a person types and settles the spelling, and nothing more', () => {
    expect(normaliseHandle('  @Coastal_Maya ')).toBe('coastal_maya');
    expect(normaliseHandle(undefined)).toBe('');
    expect(normaliseHandle(42)).toBe('');
  });

  it('accepts an ordinary name', () => {
    for (const ok of ['maya_sf', 'quiet7', 'a1b', 'the_long_one_here']) {
      expect(handleProblem(ok)).toBeNull();
    }
  });

  it('refuses the shapes that would read as something else', () => {
    expect(handleProblem('')).toBe('empty');
    expect(handleProblem('ab')).toBe('tooShort');
    expect(handleProblem('a'.repeat(21))).toBe('tooLong');
    expect(handleProblem('_leading')).toBe('shape');
    expect(handleProblem('trailing_')).toBe('shape');
    expect(handleProblem('9start')).toBe('shape');
    expect(handleProblem('has space')).toBe('shape');
    expect(handleProblem('has-dash')).toBe('shape');
    expect(handleProblem('two__under')).toBe('doubleUnderscore');
    expect(handleProblem('support')).toBe('reserved');
    expect(handleProblem('togethercity')).toBe('reserved');
  });

  it('holds back the names it hands out itself, so the two sets cannot meet', () => {
    // The exact string an unchosen profile is drawn under is not choosable.
    const generated = fallbackHandle(OTHER);
    expect(handleProblem(generated)).toBe('generated');
    expect(handleProblem('coastal_ember')).toBe('generated');
    // …and an adjective or a noun on its own is nobody's business but theirs.
    expect(handleProblem('coastal_maya')).toBeNull();
  });

  it('draws a profile with no handle under a stable generated one', () => {
    expect(fallbackHandle(ME)).toBe(fallbackHandle(ME));
    expect(fallbackHandle(ME)).not.toBe(fallbackHandle(OTHER));
    expect(fallbackHandle(ME)).toMatch(/^[a-z]+_[a-z]+$/);
    // It is built from the id and nothing else — no fragment of who they are.
    expect(fallbackHandle(ME)).not.toContain('me');
  });
});

describe('claiming a dating name', () => {
  it('refuses a name a city account already holds', async () => {
    const svc = service({ cityHandles: [CITY_HANDLE] });
    await expect(claim(svc, ME, CITY_HANDLE, null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses it even when the city account is the citizen\'s own', async () => {
    // This is the one somebody would argue about: it is their handle, why not?
    // Because using it here is handing every match the link out of the hub.
    const svc = service({ cityHandles: [CITY_HANDLE] });
    await expect(claim(svc, ME, `@${CITY_HANDLE.toUpperCase()}`, null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a name another dating profile holds', async () => {
    const svc = service({ datingHandles: [['taken_one', OTHER]] });
    await expect(claim(svc, ME, 'taken_one', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a citizen keep the name they already had', async () => {
    // Their own row is the holder; re-saving the profile must not fight it.
    const svc = service({ datingHandles: [['mine_here', ME]] });
    await expect(claim(svc, ME, 'mine_here', 'mine_here')).resolves.toBe('mine_here');
  });

  it('lets them change it — harassment is the reason, not tidiness', async () => {
    const svc = service({ datingHandles: [['mine_here', ME]] });
    await expect(claim(svc, ME, 'somewhere_else', 'mine_here')).resolves.toBe('somewhere_else');
  });

  it('refuses a bad shape before it asks the database anything', async () => {
    const svc = service({ cityHandles: [CITY_HANDLE] });
    await expect(claim(svc, ME, 'no', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a free name', async () => {
    const svc = service();
    await expect(claim(svc, ME, '  @Maya_SF ', null)).resolves.toBe('maya_sf');
  });
});

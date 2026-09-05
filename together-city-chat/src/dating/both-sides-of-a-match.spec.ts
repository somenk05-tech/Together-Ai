import * as fs from 'fs';
import * as path from 'path';
import { DatingService } from './dating.service';

/**
 * ── A WRITE THAT CHANGES TWO PEOPLE INVALIDATES TWO CACHES ──
 *
 * `cachedList` keeps `discover` and `stack` for DATING_LIST_CACHE_SEC per
 * viewer, and every write in the service throws the ACTOR's copy away. That is
 * right for almost all of them: nothing a citizen does to their own filters
 * changes what a stranger sees.
 *
 * Three writes are not like that, and on 28 Aug only one of them knew it.
 *
 *  · The flip to `matched`. The target is sent "It's a match! 💫" and a link
 *    to Curated Matches — and their cached `stack`, computed before the row
 *    existed, still answered `matched: []`. The one notification in this hub
 *    somebody stops what they are doing for opened a page that said "Nobody
 *    has matched you back yet."
 *  · `connect`. The chat is open for both; the target's card said locked.
 *  · `unmatch`. The pair is gone for both, and the other person is told
 *    nothing — so their screen kept a card, a percentage and a door into a
 *    conversation that had just been archived under them.
 *
 * `blockMatch` had always bumped both and says why in its own comment. These
 * three now match it. The order matters as much as the call: the bump goes
 * BEFORE the push, because the push is what sends them to the page.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function build() {
  const bumps: string[] = [];
  const s: any = Object.create(DatingService.prototype);
  s.redis = { up: true, raw: { incr: async (k: string) => { bumps.push(k); return bumps.length; } } };
  s.prisma = {
    datingMatch: {
      findFirst: async () => ({ id: 'm1', status: 'matched', conversationId: null }),
      update: async () => ({ id: 'm1' }),
    },
  };
  s.conversations = { archiveForAll: async () => undefined };
  return { s, bumps };
}

describe('unmatch', () => {
  it('throws away both people’s cached lists, not only the one who pressed it', async () => {
    const { s, bumps } = build();
    await s.unmatch('me', 'them', 'romantic');
    expect(bumps).toEqual(['dating:listv:me', 'dating:listv:them']);
  });

  it('still answers cleanly when there is no match to end', async () => {
    const { s, bumps } = build();
    s.prisma.datingMatch.findFirst = async () => null;
    await expect(s.unmatch('me', 'them', 'romantic')).resolves.toEqual({ ok: true });
    expect(bumps).toEqual(['dating:listv:me']);
  });
});

describe('the later of two likes', () => {
  const laterOf = (DatingService as any).laterOf as (a: Date | null, b: Date | null) => Date | null;
  const april = new Date('2026-04-02T10:00:00Z');
  const august = new Date('2026-08-28T10:00:00Z');

  /**
   * A default `.sort()` compares Dates as strings — "Fri Aug 28 2026" against
   * "Thu Apr 02 2026" — which is alphabetical, and would have put April on top
   * of the page. That is the whole reason this is a named function.
   */
  it('is chronological, not alphabetical', () => {
    expect(laterOf(april, august)).toBe(august);
    expect(laterOf(august, april)).toBe(august);
  });

  it('answers with whichever one exists, or null', () => {
    expect(laterOf(null, april)).toBe(april);
    expect(laterOf(april, null)).toBe(april);
    expect(laterOf(null, null)).toBeNull();
  });
});

describe('the wiring, read from the source', () => {
  const strip = (src: string) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
  const SERVICE = strip(fs.readFileSync(path.join(__dirname, 'dating.service.ts'), 'utf8'));

  /** The bump must sit before the create call, in the same block. */
  const bumpsBeforeThePush = (marker: string) => {
    const at = SERVICE.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    const from = SERVICE.lastIndexOf('notifications.create({', at);
    const window = SERVICE.slice(Math.max(0, from - 700), from);
    return /bumpListVersion\(targetUserId\)/.test(window);
  };

  it('tells the other person only once their page can show it — the match', () => {
    expect(bumpsBeforeThePush('It’s a match!')).toBe(true);
  });

  it('and the same for a chat that has just been opened', () => {
    expect(bumpsBeforeThePush('Someone connected to chat')).toBe(true);
  });

  /**
   * Four sites, and the count is the assertion: block (two, one per side),
   * match, connect, unmatch. If a fifth write starts changing what the other
   * person sees, this is where somebody notices.
   */
  it('bumps the other side at every write that changes what they see', () => {
    expect(SERVICE.match(/bumpListVersion\(targetUserId\)/g) ?? []).toHaveLength(4);
  });
});

describe('curated matches are ordered by when the match happened', () => {
  const SERVICE = fs.readFileSync(path.join(__dirname, 'dating.service.ts'), 'utf8');

  it('sorts on the timestamp first and keeps score as the tie-break', () => {
    expect(SERVICE).toMatch(/matchedWhen\(b\) - matchedWhen\(a\)\) \|\| \(b\.score - a\.score\)/);
  });

  it('reads the match moment off the likes, not off updatedAt', () => {
    expect(SERVICE).toMatch(/laterOf\(state\.likedAtOne, state\.likedAtTwo\)/);
    expect(SERVICE).not.toMatch(/matchedAt: [^\n]*updatedAt/);
  });
});

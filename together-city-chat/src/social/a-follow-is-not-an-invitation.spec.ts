/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { SocialService } from './social.service';
import { ConnectionsService } from '../connections/connections.service';

/**
 * ── A FOLLOW IS NOT AN INVITATION ───────────────────────────────────────────
 *
 * The 30 Aug audit opened with this: *"'Friends' means 'anyone who pressed
 * Follow'"*. It was fixed in `feed()` on 30 Aug and the commit message said the
 * read path and the interaction path finally agreed. THEY DID NOT. The fix
 * reached one of three read paths, and the second audit found the other two
 * still open:
 *
 *   · the profile grid  — `profile.service.ts` → `visibleAudiences`
 *   · `assertCanView`   — the permalink, reading and writing comments, likes
 *                         and reposts
 *
 * `ConnectionsService.visibleAudiences` read `if (follows || social)`, and
 * `SocialService.follow` needs a public handle and nothing else: no approval,
 * no notification gate, no verification. So `GET /profile/user/<handle>/posts`
 * returned every friends-audience post any citizen had ever written — captions,
 * check-in places, tagged friends and working one-hour signed URLs to the
 * photographs — to whoever pressed Follow. Unattended, against every account.
 *
 * THE ARGUMENT THAT KEPT IT ALIVE is worth writing down, because it was written
 * down: "choosing to follow someone is its own consent, and is not something
 * the followee's hub toggles revoke." That names the wrong person's consent.
 * Following is the FOLLOWER's decision; the audience on a post is the AUTHOR's.
 * A stranger cannot enlarge a promise the author made by taking an action the
 * author is never asked about.
 *
 * This file asserts the rule at the ONE function all three surfaces now go
 * through, and then at each surface, because "they all call the same helper"
 * is what was believed on 30 Aug.
 */

const AUTHOR = 'author-0';
const STRANGER = 'stranger-1';

/** ConnectionsService with a controllable connection row. `follow` is present
 *  in the database throughout — the point is that it must not matter. */
function connections(conn: unknown) {
  const prisma = {
    connection: { findFirst: async () => conn },
    // Present and returning a row, always. If the implementation reads this at
    // all, these tests are wrong about what it does.
    follow: { findUnique: async () => ({ id: 'f1' }) },
  } as any;
  return new ConnectionsService(prisma, {} as never, {} as never, {} as never);
}

const withModules = (mods: string[], relationship: string | null = 'friend') =>
  ({ id: 'c1', modulesJson: JSON.stringify(mods), relationship });

describe('following somebody does not put you in their friends circle', () => {
  it('gives a follower with NO connection nothing but public', async () => {
    await expect(connections(null).visibleAudiences(STRANGER, AUTHOR))
      .resolves.toEqual(['public']);
  });

  it('gives a follower whose connection has Social unticked nothing but public', async () => {
    await expect(connections(withModules(['travel', 'fitness'])).visibleAudiences(STRANGER, AUTHOR))
      .resolves.toEqual(['public']);
  });

  it('opens the circle to an accepted connection with Social granted', async () => {
    await expect(connections(withModules(['social'])).visibleAudiences(STRANGER, AUTHOR))
      .resolves.toEqual(['public', 'friends']);
  });

  it('still needs BOTH family and Social for family posts', async () => {
    await expect(connections(withModules(['social'], 'family')).visibleAudiences(STRANGER, AUTHOR))
      .resolves.toEqual(['public', 'friends', 'family']);
    await expect(connections(withModules(['travel'], 'family')).visibleAudiences(STRANGER, AUTHOR))
      .resolves.toEqual(['public']);
  });

  it('does not read the follow table at all', async () => {
    /* THE ASSERTION THAT CANNOT BE SATISFIED BY ACCIDENT. Every test above
       would also pass if the implementation read `follow` and then ignored the
       answer — and a later "optimisation" restoring `follows ||` would turn
       them all red for a reason somebody might misread as a stub problem. This
       one says the query is gone, which is also two queries saved on a path
       that runs for every grid read and every interaction. */
    let read = false;
    const prisma = {
      connection: { findFirst: async () => withModules(['social']) },
      follow: { findUnique: async () => { read = true; return { id: 'f1' }; } },
    } as any;
    await new ConnectionsService(prisma, {} as never, {} as never, {} as never)
      .visibleAudiences(STRANGER, AUTHOR);
    expect(read).toBe(false);
  });
});

/**
 * ── AND THE SAME RULE ON THE SURFACES ───────────────────────────────────────
 *
 * `assertCanView` gates the permalink, the comment read and write, the like and
 * the repost. One test per outcome rather than per route, because they all fail
 * closed through the same call.
 */
describe('assertCanView refuses a follower a friends-audience post', () => {
  const svc = (allowed: string[]) => {
    const post = { id: 'p1', authorId: AUTHOR, audience: 'friends', moderation: 'visible' };
    const prisma = {
      post: { findUnique: async () => ({ ...post, author: {}, media: [], _count: { likes: 0, comments: 0 }, likes: [], repostOf: null, createdAt: new Date() }) },
    } as any;
    const blocking = { blockedWith: async () => new Set<string>() } as any;
    const conns = { visibleAudiences: async () => allowed } as any;
    const storage = { signPostMedia: async () => new Map() } as any;
    return new SocialService(prisma, {} as never, {} as never, storage, conns, blocking, {} as never);
  };

  it('refuses when the viewer is only a follower', async () => {
    await expect(svc(['public']).post(STRANGER, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when the viewer is an accepted connection with Social', async () => {
    await expect(svc(['public', 'friends']).post(STRANGER, 'p1')).resolves.toBeTruthy();
  });
});

/**
 * ── AND IN THE FEED, WHICH IS WHERE THE 30 AUG FIX LANDED ───────────────────
 *
 * The feed builds its own `circle` from the cached graph rather than calling
 * `visibleAudiences`. That is why the two drifted, and why the fix had to reach
 * both: as of 31 Aug the feed asks the same question through the same exported
 * predicate.
 */
describe('the feed builds the same circle', () => {
  const graph = (conns: unknown[], follows: string[]) => ({
    blocked: new Set<string>(), conns, follows,
  }) as any;
  const svc = () => new SocialService(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    { blockedWith: async () => new Set<string>() } as never, {} as never,
  );
  const circleOf = (g: unknown) =>
    (svc() as unknown as { fromGraph(u: string, g: unknown): { circle: string[]; network: string[] } })
      .fromGraph(AUTHOR, g);

  it('excludes a connection whose Social grant is off', () => {
    const out = circleOf(graph(
      [{ userOneId: AUTHOR, userTwoId: 'c-on', relationship: 'friend', modulesJson: '["social"]' },
        { userOneId: AUTHOR, userTwoId: 'c-off', relationship: 'friend', modulesJson: '["travel"]' }],
      [],
    ));
    expect(out.circle).toEqual(['c-on']);
  });

  it('excludes a mere follower from the circle', () => {
    const out = circleOf(graph([], ['followed-them']));
    expect(out.circle).toEqual([]);
  });

  it('keeps the follower in NETWORK, which is a different question', () => {
    // `network` is "whose posts may appear at all" — a follower legitimately
    // sees public posts. Narrowing it would empty the Following lens rather
    // than close a leak.
    const out = circleOf(graph([], ['followed-them']));
    expect(out.network).toContain('followed-them');
  });
});

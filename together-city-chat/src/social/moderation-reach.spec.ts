import { SocialService } from './social.service';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * A removed post stays removed.
 *
 * Post.moderation is only worth having if every read of Post respects it. A
 * console that records "removed" while the post carries on appearing would be
 * worse than no console: it lets a moderator believe they acted, and the
 * citizen who reported it believe somebody did.
 *
 * Reads scoped to the viewer's OWN posts are exempt, and named here with the
 * reason. The author is meant to see their removed post — silent disappearance
 * is how somebody concludes the app ate their evening and posts it again.
 */
const POST_READS = /this\.prisma\.post\.(findMany|count)\(/g;

/** Every exempt read, with why. A new one has to be argued for here. */
const AUTHOR_SCOPED = [
  { file: 'profile/profile.service.ts', note: "the citizen's own post count on their own profile" },
  { file: 'profile/profile.service.ts', note: "the citizen's own engagement stats" },
  { file: 'profile/profile.service.ts', note: "the citizen's own grid, where a removed post must still show" },
  { file: 'profile/profile.service.ts', note: 'an ownership check by id, not a list anybody reads' },
];

describe('moderation reaches every list read of Post', () => {
  const FILES = ['social/social.service.ts', 'profile/profile.service.ts'];

  it('leaves no unaccounted read', () => {
    let filtered = 0;
    let exempt = 0;

    for (const file of FILES) {
      const src = read(file);
      for (const m of src.matchAll(POST_READS)) {
        // The `where` of this call: from the match to the closing of its object.
        const tail = src.slice(m.index ?? 0, (m.index ?? 0) + 400);
        if (tail.includes('VISIBLE_ONLY')) filtered++;
        else exempt++;
      }
    }

    // Every read is one or the other, and the exempt ones are the four named
    // above. If this count moves, a read was added: filter it, or add it to
    // AUTHOR_SCOPED with the reason it does not need filtering.
    expect(exempt).toBe(AUTHOR_SCOPED.length);
    expect(filtered).toBeGreaterThanOrEqual(4);
  });

  it('the feed and the public grid are among the filtered ones', () => {
    const social = read('social/social.service.ts');
    const profile = read('profile/profile.service.ts');
    // The feed.
    expect(social).toMatch(/post\.findMany\(\{\s*where:\s*\{\s*\.\.\.VISIBLE_ONLY/);
    // Somebody else's profile grid.
    expect(profile).toContain('...VISIBLE_ONLY, authorId: u.id');
  });

  /**
   * THIS ONE USED TO BE A STRING MATCH, AND THE 30 AUG AUDIT WAS RIGHT ABOUT IT.
   *
   * It asserted that the source contained the characters
   * `decision === 'remove' && targetType !== 'post'`. That is not a claim about
   * what reportDecide does; it is a claim about how somebody spelled it. When
   * the rule legitimately changed — a comment can be removed now, an account
   * still cannot — the assertion failed for the one reason a test should never
   * fail: the letters moved. And it would have gone on passing if the branch
   * had been written correctly and then never reached.
   *
   * So it calls the method. The permission check keeps its source assertion,
   * because `access.assert` is a collaborator this file has no double for and
   * asserting the wiring is honest as long as it says that is what it is doing.
   */
  it('removes a post and a comment, and refuses to remove an account', async () => {
    const removed: string[] = [];
    const prisma = {
      post: {
        findUnique: async () => ({ authorId: 'author' }),
        updateMany: async ({ data }: { data: { moderation: string } }) => { removed.push(`post:${data.moderation}`); return { count: 1 }; },
      },
      comment: {
        findUnique: async () => ({ authorId: 'rude' }),
        delete: async () => { removed.push('comment:deleted'); return {}; },
      },
      report: { updateMany: async () => ({ count: 1 }) },
    } as never;
    const access = { assert: jest.fn(async () => ['moderator']), act: jest.fn() } as never;
    const notifications = { create: jest.fn(async () => undefined) } as never;
    const svc = new SocialService(prisma, {} as never, notifications, {} as never, {} as never, {} as never, access);

    await svc.reportDecide('mod', { targetType: 'post', targetId: 'p1', decision: 'remove' });
    await svc.reportDecide('mod', { targetType: 'comment', targetId: 'c1', decision: 'remove' });
    expect(removed).toEqual(['post:removed', 'comment:deleted']);

    await expect(svc.reportDecide('mod', { targetType: 'user', targetId: 'u1', decision: 'remove' }))
      .rejects.toThrow();
  });

  it('asks the permission system, and not User.role, before deciding anything', () => {
    const src = read('social/social.service.ts');
    const at = src.indexOf('async reportDecide(');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf('\n  }', at));
    expect(body).toContain("this.access.assert(adminId, 'moderation.act')");
  });

  it('the queue counts reporters and never returns them', () => {
    const src = read('social/social.service.ts');
    const at = src.indexOf('async reportQueue(');
    const body = src.slice(at, src.indexOf('\n  }', at));
    expect(body).toContain("this.access.assert(adminId, 'moderation.read')");
    expect(body).toContain('distinctReporters: g.reporters.size');
    // The set of ids must not leave the method.
    expect(body).not.toMatch(/reporters:\s*\[\.\.\.g\.reporters\]/);
    expect(body).not.toMatch(/reporterIds/);
  });
});

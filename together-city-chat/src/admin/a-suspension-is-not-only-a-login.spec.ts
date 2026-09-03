import { readFileSync } from 'fs';
import { join } from 'path';
import { REACHABLE_ACCOUNT, REACHABLE_USER, accountReachable } from './account-reach';

/**
 * ── A SUSPENSION WAS A LOGIN BLOCK AND NOTHING ELSE ─────────────────────────
 *
 * `grep -rn suspendedAt src` returned hits in exactly four places — the JWT
 * strategy, the token service, the auth service and this console. No content
 * read filtered it. So a moderator suspending an account reported five times
 * for sexual harassment in matchmaking closed its login: the DatingProfile was
 * still `visible: true, moderation: 'approved'`, so it stayed in every
 * citizen's Discover pool, went on being scored, went on being served its
 * signed photographs, and went on being MATCHED with — generating "you have a
 * new match" pushes to the people who reported it, from an account that can
 * never reply. Its posts stayed in the public feed and its profile stayed in
 * search.
 *
 * The fix is ONE PREDICATE, not a clause typed into nine `where`s. This file is
 * what keeps it one: the reads below are named, and a read that stops naming
 * the predicate is a failing test rather than a discovery.
 */
const SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const slice = (src: string, from: string, len = 2600) => src.slice(src.indexOf(from), src.indexOf(from) + len);

describe('the predicate itself', () => {
  it('names deletion and suspension together, because every caller wants both', () => {
    expect(REACHABLE_ACCOUNT).toEqual({ deletedAt: null, suspendedAt: null });
    expect(REACHABLE_USER).toEqual({ is: { deletedAt: null, suspendedAt: null } });
  });

  it('answers the same question about a row already read', () => {
    expect(accountReachable({ deletedAt: null, suspendedAt: null })).toBe(true);
    expect(accountReachable({})).toBe(true);
    expect(accountReachable(null)).toBe(false);
    expect(accountReachable(undefined)).toBe(false);
    expect(accountReachable({ suspendedAt: new Date() })).toBe(false);
    expect(accountReachable({ deletedAt: new Date() })).toBe(false);
  });
});

describe('every read a citizen can reach spreads it', () => {
  it('the matchmaking pool, and therefore every list built from it', () => {
    const dating = read('dating/dating.service.ts');
    // STILL_HERE is the value the whole hub reads through — nine call sites.
    expect(dating).toMatch(/private static readonly STILL_HERE = REACHABLE_USER;/);
    expect(slice(dating, 'private poolWhere(')).toContain('user: REACHABLE_USER');
    // And the two single-row doors a URL somebody already holds can reach.
    expect(slice(dating, 'private async assertWritable')).toContain('accountReachable(cand.user');
    expect(slice(dating, 'async matchDetail')).toContain('accountReachable(cand.user');
  });

  it('the city feed and the map', () => {
    const social = read('social/social.service.ts');
    // Twice: the feed and the geo-pinned map read Post, and both join the author.
    expect((social.match(/author: REACHABLE_USER,/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // And the single-post doors: the permalink, the share, and the gate every
    // comment and like passes through.
    expect(slice(social, 'private async assertPost(', 700)).toContain('author: REACHABLE_USER');
    expect(slice(social, 'async post(userId: string, postId: string)', 700)).toContain('author: REACHABLE_USER');
    expect(slice(social, 'async repost(', 500)).toContain('author: REACHABLE_USER');
  });

  it('the public profile, its grid, and People search', () => {
    const profile = read('profile/profile.service.ts');
    expect(slice(profile, 'async publicProfile(')).toContain('!u || !accountReachable(u)');
    expect(slice(profile, 'async publicPosts(')).toContain('!u || !accountReachable(u)');
    expect(slice(profile, 'async searchPeople(')).toContain('...REACHABLE_ACCOUNT');
  });

  it('leaves the moderator’s own read alone, and says why here', () => {
    // `reportSubjects` MUST still show a suspended account: it is the queue the
    // suspension was decided in, and a queue that hides what it acted on shows
    // the next moderator an empty card and invites them to dismiss it.
    const social = read('social/social.service.ts');
    const subjects = slice(social, 'private async reportSubjects(', 3200);
    expect(subjects).not.toContain('REACHABLE');
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ── SIXTEEN OF THIRTY-THREE DOORS HAD NO LOCK OF THEIR OWN ──────────────────
 *
 * `unlock-chat` was found on 28 Aug reachable at twice the rate limit of the
 * identical action next to it, because it carried no `@Throttle` and `connect`
 * did. Deleting it fixed one door and raised the obvious question about the
 * other thirty-two.
 *
 * A route with no `@Throttle` is not unlimited — the global default is 120 a
 * minute. It is *at the default*, which for most reads is fine and for three
 * routes was badly wrong:
 *
 *   POST /dating/profile — runs `aiBioModeration`, a live MODEL CALL, on every
 *     save. At 120 a minute one citizen could bill 120 model calls a minute
 *     indefinitely, and the first sign of it would be the invoice. Now
 *     PROFILE_LIMIT (12).
 *
 *   GET /dating/matches/:targetUserId — one person's full detail and their
 *     photographs, and the only read in the hub that enumerates individuals
 *     rather than returning a page. `discover`, `stack`, `chats` and every
 *     admin list carry LIST_LIMIT (20); this one sat at 120, six times looser
 *     than the reads that expose less. Now LIST_LIMIT.
 *
 *   unmatch, block, undo-pass — decisions about another person, sitting beside
 *     like, pass, connect, reveal and super-like, which all carry
 *     DECISION_LIMIT. The five that were limited and the three that were not
 *     are the same kind of action. Now DECISION_LIMIT.
 *
 * The rule this file keeps is not "every route must be throttled" — that would
 * be satisfied by writing a number nobody thought about. It is that any route
 * left at the global default is left there ON PURPOSE, by name, in the list
 * below. A new route is unlisted by default, so the guard makes somebody
 * decide.
 */
describe('a limit on every door into the dating hub', () => {
  const src = strip(read('dating/dating.controller.ts'));

  /**
   * Deliberately at the global default (120/min).
   *
   * Every READ in this controller now carries LIST_LIMIT — including the four
   * admin lists, two of which (`admin/stats`, `admin/photos`) this guard found
   * unthrottled after a hand audit had recorded them as limited. The hand
   * audit used the same broken window the first parser did.
   *
   * What is left here is two trivial reads of the caller's own state, one
   * idempotent delete, and the admin WRITES — where the gate is
   * MODERATION_ADMINS and a human moderator is the rate limit. Adding a number
   * to those would be writing a limit nobody reasoned about, which is the
   * thing this file is against.
   */
  const AT_GLOBAL_DEFAULT = new Set([
    'GET profile',            // the caller's own profile
    'DELETE profile',         // idempotent, and destructive exactly once
    'GET allowance',          // the caller's own like count
    'POST admin/moderation/:targetUserId',
    'POST admin/photos/decide',
    'POST admin/photos/backfill',
    'POST admin/appeals/:id/decide',
  ]);

  /**
   * Parsed by LINES, not by a slice around the route decorator.
   *
   * The first draft of this sliced forwards from `@Get(...)` to the next `{`
   * and read the verb as written. Both were wrong: `@Throttle` sits AFTER
   * `@Post` on most routes here but BEFORE `@Get` on `photo/:token`, so a
   * forward-only window missed half of them; and the decorator spells the verb
   * `Post` while the allowlist below reads `POST`. It reported fourteen false
   * positives on its first run. Rather than adjust the expected list until it
   * matched — which would have baked the parser's bug into the guard — the
   * parser was replaced: walk up from the route decorator across the whole
   * contiguous decorator block, and normalise the verb.
   */
  const lines = src.split('\n');
  const routes = lines.flatMap((line, i) => {
    const m = /@(Get|Post|Patch|Delete|Put)\('([^']*)'\)/.exec(line);
    if (!m) return [];
    let top = i;
    while (top > 0 && /^\s*[@)]|^\s*$/.test(lines[top - 1]) && !/@(Get|Post|Patch|Delete|Put)\(/.test(lines[top - 1])) top -= 1;
    let end = i;
    while (end < lines.length - 1 && !/\)\s*\{\s*$|\{\s*$/.test(lines[end])) end += 1;
    const block = lines.slice(top, end + 1).join('\n');
    const thr = /@Throttle\((\w+)\)/.exec(block);
    return [{ key: `${m[1].toUpperCase()} ${m[2]}`, throttle: thr?.[1] ?? null }];
  });

  it('read the controller at all', () => {
    // A regex that matches nothing passes every assertion below.
    expect(routes.length).toBeGreaterThan(25);
  });

  it('leaves no route at the global default without saying so', () => {
    const silent = routes.filter((r) => !r.throttle && !AT_GLOBAL_DEFAULT.has(r.key)).map((r) => r.key);
    // Named, so a new route says which one it is rather than a bare count.
    expect(silent).toEqual([]);
  });

  it('does not list a route that is in fact throttled', () => {
    // The allowlist rots the other way too: a route given a limit later should
    // drop off this list, or the list stops meaning "decided to leave open".
    const stale = routes.filter((r) => r.throttle && AT_GLOBAL_DEFAULT.has(r.key)).map((r) => r.key);
    expect(stale).toEqual([]);
    // And every name on the list is a real route.
    const keys = new Set(routes.map((r) => r.key));
    expect([...AT_GLOBAL_DEFAULT].filter((k) => !keys.has(k))).toEqual([]);
  });

  it('prices a model call differently from a database row', () => {
    // PROFILE_LIMIT exists because saving a bio costs a model call. If it ever
    // equals DECISION_LIMIT, the distinction this file argues for is gone.
    const profile = /const PROFILE_LIMIT = \{ default: \{ ttl: 60_000, limit: (\d+) \} \}/.exec(src);
    const decision = /const DECISION_LIMIT = \{ default: \{ ttl: 60_000, limit: (\d+) \} \}/.exec(src);
    expect(profile).not.toBeNull();
    expect(decision).not.toBeNull();
    expect(Number(profile![1])).toBeLessThan(Number(decision![1]));
  });

  it('holds the three that were actually wrong', () => {
    const byKey = new Map(routes.map((r) => [r.key, r.throttle]));
    expect(byKey.get('POST profile')).toBe('PROFILE_LIMIT');
    expect(byKey.get('GET matches/:targetUserId')).toBe('LIST_LIMIT');
    for (const k of ['POST matches/:targetUserId/unmatch', 'POST matches/:targetUserId/block', 'POST undo-pass']) {
      expect({ k, limit: byKey.get(k) }).toEqual({ k, limit: 'DECISION_LIMIT' });
    }
  });
});

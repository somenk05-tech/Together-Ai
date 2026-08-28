import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A TAKEDOWN REACHES THE PEOPLE WHO ALREADY MATCHED ──
 *
 * Curated Matches deliberately bypasses `poolWhere` for people you have already
 * matched: pausing, hiding, editing your preferences or dropping past the
 * 2000-row ceiling must not make you vanish from somebody who chose you. That
 * paragraph is right and stays.
 *
 * It swept up one state nobody chose. A moderator's rejection left the profile
 * on its matches' Curated Matches and Chats tabs — name, age, bio, city,
 * occupation, traits — because `endMyChats` only reaches rows carrying a
 * conversationId, and a match nobody has opened has none. A profile taken down
 * for being sixteen kept a live presence on adults' screens.
 *
 * `pending` and `review` are NOT excluded, deliberately: they are what a
 * profile says while somebody is looking at it again, usually right after its
 * own owner edited it, and disappearing mid-review is the over-correction the
 * bypass exists to avoid.
 */
const src = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');

const between = (from: string, to: string) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('a takedown reaches the people who already matched', () => {
  it('drops a rejected partner from the curated merge', () => {
    const merge = between('const matchedPartnerIds = states', 'const seenCand');
    expect(merge).toMatch(/moderation: \{ not: 'rejected' \}/);
    expect(merge).toMatch(/user: DatingService\.STILL_HERE/);
  });

  it('drops the whole match from the chats tab, not just its profile', () => {
    const chats = between('const matches = allMatches.filter((m) => {', 'const otherIds = matches.map(other);');
    expect(chats).toMatch(/moderation \?\.\s*!== 'rejected'|moderation !== 'rejected'/);
    // The MATCH is filtered, not merely its profile: a row with no profile
    // still renders, from the account name, which is a worse answer than the
    // row not being there.
    expect(chats).toMatch(/userOf\.has\(id\)/);
    expect(chats).toMatch(/!blocked\.has\(id\)/);
  });

  /**
   * The states a citizen chose stay visible. If this ever becomes
   * `moderation: 'approved'` the bypass is gone and the two screens disagree
   * again, which is the bug the bypass was written to fix.
   */
  it('does not exclude pending or review', () => {
    const merge = between('const matchedPartnerIds = states', 'const seenCand');
    expect(merge).not.toMatch(/moderation: 'approved'/);
    expect(merge).not.toMatch(/moderation: \{ in: \[/);
  });
});

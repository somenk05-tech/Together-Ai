import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ── WHAT THE MEDIUM TIER CHANGED, HELD IN SOURCE (31 Aug) ───────────────────
 *
 * Four medium fixes whose behaviour lives across files, each pinned where a
 * regression would re-open it. Companion behaviour specs:
 * `a-no-stays-a-no`, `an-approval-is-not-an-unpausing`,
 * `nobody-can-be-placed`, `the-filters-hold-at-the-door`.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

describe('one chat per kind (medium 2, owner decision)', () => {
  it('a platonic connect opens its own thread', () => {
    const svc = code(read('dating/dating.service.ts'));
    expect(svc).toMatch(/getOrCreateDirectByIds\(\s*userId, targetUserId, 'dating', 1, kind === 'platonic' \? 'platonic' : undefined,?\s*\)/);
  });
  it('the door suffixes the key for a named thread and leaves the bare key alone', () => {
    const conv = code(read('conversations/conversations.service.ts'));
    expect(conv).toMatch(/thread \? `\$\{directKeyOf\(aId, bId\)\}#\$\{thread\}` : directKeyOf\(aId, bId\)/);
  });
});

describe('the verdict is about the bytes that were read (medium 4)', () => {
  it('the etag comes from the same GET as the bytes, not a later HEAD', () => {
    const mod = code(read('dating/photo-moderation.service.ts'));
    expect(mod).not.toContain('healthObjectETag');
    expect(mod).toMatch(/etag: obj\.etag \?\? null/);
    // A vault read with no identity stays pending rather than un-checkable.
    expect(mod).toMatch(/if \(!entry\.startsWith\('data:'\) && !etag\) return 'pending';/);
  });
});

describe('who you seek is a romantic question, in SQL too (medium 7)', () => {
  it('poolWhere narrows by gender only for the romantic kind', () => {
    const svc = code(read('dating/dating.service.ts'));
    expect(svc).toMatch(/const seeking = kind === 'romantic'/);
    // Both list builders hand their kind to the query.
    expect((svc.match(/poolWhere\(userId, mine, myDForQuery, kind\)/g) ?? []).length).toBe(2);
  });
});

describe('one number, everywhere (medium 8, owner decision)', () => {
  it('the stack displays the standard score and keeps the learned one as ordering', () => {
    const svc = code(read('dating/dating.service.ts'));
    // Displayed: standard. Ordering: learned, held beside the card.
    expect(svc).toMatch(/const score = overallScore\(breakdown, conf\);\s*\n\s*const rank = overallScoreWith\(breakdown, ranking\.weights, conf\);/);
    expect(svc).toMatch(/rankOf\.set\(card, rank\);/);
    expect(svc).toMatch(/rankOf\.get\(b\) \?\? b\.score/);
    // The learned number never reaches the wire as a field.
    expect(svc).not.toMatch(/rank: rank/);
    expect(svc).not.toMatch(/\brank,\n/);
  });
});

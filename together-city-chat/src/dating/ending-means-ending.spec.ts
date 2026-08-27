import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── WHEN SOMEBODY ENDS IT, IT ENDS ─────────────────────────────────────────
 *
 * Two findings from the launch audit, and they are the same finding twice: a
 * person said they wanted out, and the system carried on anyway.
 *
 *   · UNMATCH archived the conversation and flipped the match to `passed`. The
 *     message gate read membership and blocks and never read match status —
 *     and archiving is a per-member flag the member can reverse themselves, in
 *     one tap. So an unmatched person unarchived the thread and kept writing.
 *     The interface offered Unmatch as the gentler alternative to Block and
 *     meant it; the server did not.
 *   · DELETING YOUR ACCOUNT left the dating profile in every other citizen's
 *     pool for the thirty days until the purge cron. The whole module held no
 *     reference to `deletedAt`, and the pool query asks only about `visible`
 *     and `moderation`, neither of which deletion touches.
 *
 * Both are one clause each. Both were invisible because nothing asked.
 */
describe('when somebody ends it, it ends', () => {
  const gate = code('connections/connection-permission.service.ts');
  const dating = code('dating/dating.service.ts');

  it('refuses a message into a conversation whose match is over', () => {
    // The gate must consult the match, not just membership and blocks.
    expect(gate).toMatch(/await this\.assertMatchStillStands\(userId, conversationId\)/);
    expect(gate).toMatch(/if \(match\.status !== 'matched'\)/);
    expect(gate).toMatch(/throw new ForbiddenException\('This conversation has ended\.'\)/);
    // Structurally BEFORE the early return that used to be the whole branch —
    // asserted as shape rather than as two indexes, because `anonymousTrust`
    // and `assertCanCommunicate` appear elsewhere in the file and a slice
    // between them silently inverts.
    expect(gate).toMatch(
      /anonymousTrust != null\) \{\s*await this\.assertMatchStillStands\(userId, conversationId\);\s*return;\s*\}/,
    );
  });

  it('does not break the chats that never had a match to end', () => {
    // Accepting an activity invitation opens a direct conversation between two
    // people who never matched — no DatingMatch row exists. Demanding one here
    // would have silently killed every activity chat in the city.
    expect(gate).toMatch(/if \(!match\) return;/);
    // Looked up BY conversation, which is why the index below has to exist.
    expect(gate).toMatch(/findFirst\(\{ where: \{ conversationId \}/);
  });

  it('indexes the lookup it just put on the hot path', () => {
    // A permission check on every dating send that scans the match table is a
    // safety fix that becomes an outage at scale.
    const schema = read('../prisma/schema.prisma');
    const model = schema.slice(schema.indexOf('model DatingMatch'), schema.indexOf('model DatingMatch') + 2200);
    expect(model).toMatch(/@@index\(\[conversationId\]\)/);
    const sql = read('../prisma/migrations/20260827140000_match_by_conversation/migration.sql');
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "DatingMatch_conversationId_idx"/);
  });

  it('takes a deleted citizen out of everybody’s pool immediately', () => {
    // On the relation, not copied onto the profile: the tombstone lives on
    // User and a second copy is a second thing to keep in step.
    expect(dating).toMatch(/user: \{ is: \{ deletedAt: null \} \}/);
    // One place, so every list that reads the pool inherits it.
    const pool = dating.slice(dating.indexOf('private poolWhere'), dating.indexOf('private birthDateRangeFor'));
    expect(pool).toContain('deletedAt');
  });
});

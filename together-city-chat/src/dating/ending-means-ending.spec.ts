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

  /**
   * AND OUT OF EVERY PATH, NOT JUST THE LISTS.
   *
   * The first pass put the clause in `poolWhere`, which closed matches,
   * discover, the stack and the curated cards — all built from those same
   * candidates. It did NOT close the profile page, which is reached by a URL
   * somebody already holds: a bookmark, a link in a chat, a notification from
   * before they left. Nor `assertWritable`, so they could still be liked.
   *
   * The scar this repeats is written in CLAUDE.md: a guard is only proven
   * where the data has reached.
   */
  it('closes the direct profile URL, and every write, to somebody who left', () => {
    const detail = dating.slice(dating.indexOf('async matchDetail'), dating.indexOf('async matchDetail') + 2600);
    expect(detail).toMatch(/deletedAt: true/);
    expect(detail).toMatch(/accountReachable\(cand\.user/);
    const write = dating.slice(dating.indexOf('private async assertWritable'), dating.indexOf('private async assertWritable') + 1400);
    expect(write).toMatch(/user: \{ select: \{ deletedAt: true, suspendedAt: true \} \}/);
    expect(write).toMatch(/accountReachable\(cand\.user/);
  });

  it('takes a deleted citizen out of everybody’s pool immediately', () => {
    // On the relation, not copied onto the profile: the tombstone lives on
    // User and a second copy is a second thing to keep in step.
    expect(dating).toMatch(/user: REACHABLE_USER/);
    // One place, so every list that reads the pool inherits it. Since 3 Sep
    // that place is `REACHABLE_ACCOUNT` in admin/account-reach.ts — a deleted
    // account and a SUSPENDED one are the same question, and the suspension
    // half was being asked nowhere at all: a suspended harasser stayed in every
    // citizen's pool, kept being scored and kept being matched with.
    const pool = dating.slice(dating.indexOf('private poolWhere'), dating.indexOf('private birthDateRangeFor'));
    expect(pool).toContain('REACHABLE_USER');
    const reach = read('admin/account-reach.ts');
    expect(reach).toContain('deletedAt');
    expect(reach).toContain('suspendedAt');
  });
});

/**
 * ── AND IT ENDS ON THE SOCKET TOO (fifth audit, 29 Aug) ────────────────────
 *
 * The gate above stopped the message and stopped nothing else. Typing
 * indicators, presence and read receipts are broadcast to
 * `room.conversation(id)` and consult no database at all — being in the room
 * IS the permission — and `unmatch` published nothing, so both sockets stayed
 * in it. The person who ended the conversation went on being watched typing
 * into it, and went on watching the other come online, for as long as neither
 * of them reconnected. Which, for a phone that never closes the app, is never.
 *
 * A block already had this event. An unmatch, which the interface offers as
 * the gentler of the two, did not.
 */
describe('and it ends on the socket too', () => {
  const dating = code('dating/dating.service.ts');
  const events = code('shared/events/chat-events.ts');
  const gateway = code('chat/chat.gateway.ts');

  it('the bus has a word for it', () => {
    expect(events).toMatch(/kind: 'connection\.unmatched'; userIds: \[string, string\]; conversationId: string/);
  });

  it('unmatch says it, and says it after the write', () => {
    const fn = dating.slice(dating.indexOf('async unmatch('), dating.indexOf('async unmatch(') + 3000);
    expect(fn).toMatch(/kind: 'connection\.unmatched'/);
    expect(fn.indexOf("status: 'passed'")).toBeLessThan(fn.indexOf("connection.unmatched"));
  });

  it('and so does the teardown that ends every chat at once', () => {
    const fn = dating.slice(dating.indexOf('private async endMyChats('), dating.indexOf('private async endMyChats(') + 2500);
    expect(fn).toMatch(/kind: 'connection\.unmatched'/);
    // It needs the pair to empty the room, so it has to read the pair.
    expect(fn).toMatch(/userOneId: true, userTwoId: true/);
  });

  it('and so does a PASS on a live match, which was the path that was missed', () => {
    // `unmatch` and `endMyChats` published; `pass` did not, and the comment
    // beside it shows a pass on a matched row is anticipated rather than
    // impossible. Sending stopped; typing, presence and receipts did not.
    // (re-audit, 29 Aug)
    const fn = dating.slice(dating.indexOf('async pass('), dating.indexOf('async pass(') + 2500);
    expect(fn).toMatch(/kind: 'connection\.unmatched'/);
    // Only when there was a live conversation to end.
    expect(fn).toMatch(/state\.conversationId && state\.status === 'matched'/);
  });

  it('the gateway empties that one room for both of them', () => {
    const arm = gateway.slice(gateway.indexOf("case 'connection.unmatched'"), gateway.indexOf("case 'presence.changed'"));
    expect(arm).toMatch(/socketsLeave\(room\.conversation\(event\.conversationId\)\)/);
    expect(arm).toMatch(/for \(const uid of \[a, b\]\)/);
  });

  it('and the room list stops rebuilding it on the next connection', () => {
    // The event is the half that does not wait for a reconnect; this is the
    // half that survives one.
    expect(gateway).toMatch(/const ended = await this\.messages\.endedDatingIds\(ids\)/);
  });
});


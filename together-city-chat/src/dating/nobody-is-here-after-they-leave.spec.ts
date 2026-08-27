import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── THIS FINDING TOOK THREE PASSES, AND THIS FILE IS WHY THERE IS NO FOURTH ──
 *
 * Account deletion here is a tombstone for thirty days, then a purge. It sets
 * `User.deletedAt` and touches NOTHING in the dating module — not a profile,
 * not a match, not an invite. So every dating read that does not name
 * `deletedAt` hands back somebody who has gone.
 *
 * Pass one   put the clause in `poolWhere`. That closed every LIST.
 * Pass two   found `matchDetail` and `assertWritable` — the paths a URL
 *            somebody already holds can reach. Both were believed complete.
 * Pass three found four more (three activity cases it also found are
 * moot now — Activity Dating was removed on 27 Aug):
 *
 *   1. `datingChats` — the chats TAB listed every pre-deletion match with the
 *      departed person's first name, signed photograph, age, star sign and
 *      compatibility score. Reached by tapping a tab.
 *   2. `assertMatchStillStands` read only `match.status`, which deletion never
 *      changes, so you could keep typing at somebody for a month. (The
 *      check sits on the general direct-chat branch, before the match-only
 *      one, so it also covered the activity chats that used to exist here.)
 *   3. `reindexAfterChange`, a hand-copied duplicate of `poolWhere`, kept
 *      scoring departed accounts and PUSHING "you have a new match" to their
 *      phone. `DeviceToken` is not purged until day thirty, so it arrived.
 *   4. `undoLastPass` could set a match back to `matched` with somebody who
 *      had since left, resurrecting 1 and 2 with one button.
 *
 * The pattern is not carelessness, it is a clause that has to be REMEMBERED.
 * So there is one now — `DatingService.STILL_HERE` and `stillHere` /
 * `assertStillHere` — and these assertions fail if a path stops using it.
 */
describe('nobody is here after they leave', () => {
  const svc = code(read('dating/dating.service.ts'));
  const gate = code(read('connections/connection-permission.service.ts'));

  it('has ONE definition of the question, not a clause people retype', () => {
    expect(svc).toMatch(/private static readonly STILL_HERE = \{ is: \{ deletedAt: null \} \}/);
    expect(svc).toMatch(/private async stillHere\(userId: string\): Promise<boolean>/);
    expect(svc).toMatch(/private async assertStillHere\(userId: string\): Promise<void>/);
  });

  it('1 · the chats tab drops matches with somebody who has gone', () => {
    // The account read does the filtering, and `matches` is narrowed from
    // `allMatches` before the positional pairKeys are built.
    expect(svc).toMatch(/id: \{ in: allMatches\.map\(other\) \}, deletedAt: null/);
    expect(svc).toMatch(/const matches = allMatches\.filter\(\(m\) => userOf\.has\(other\(m\)\)\)/);
  });

  it('2 · the message gate refuses a direct line to somebody who has gone', () => {
    // In assertCanPostToConversation, NOT inside the dating branch — an
    // activity chat never reaches assertMatchStillStands.
    const body = gate.slice(gate.indexOf('assertCanPostToConversation'), gate.indexOf('assertMatchStillStands'));
    expect(body).toMatch(/deletedAt/);
    expect(body).toMatch(/This conversation has ended\./);
    // And it must sit before the branch that returns early for activity chats.
    expect(body.indexOf('deletedAt')).toBeLessThan(body.indexOf('anonymousTrust'));
  });

  it('3 · the notifier stops scoring and paging people who have left', () => {
    // reindexAfterChange hand-copies poolWhere's WHERE. poolWhere's own comment
    // claimed the two matched exactly, and for one release that was false.
    const reindex = svc.slice(svc.indexOf('reindexAfterChange'), svc.indexOf('connectionExclusions('));
    expect(reindex).toMatch(/user: DatingService\.STILL_HERE/);
  });

  it('4 · undo cannot resurrect a match with somebody who has left', () => {
    // Bounded by the NEXT method rather than a named one: an earlier version of
    // this file sliced to `likeAllowance`, which sits above undoLastPass — the
    // slice was empty and the assertion passed against nothing. Two indexes and
    // no proof they are in order is not a test.
    const start = svc.indexOf('async undoLastPass');
    expect(start).toBeGreaterThan(-1);
    const undo = svc.slice(start, start + 3000);
    expect(undo).toMatch(/if \(!\(await this\.stillHere\(targetId\)\)\)/);
    expect(undo).toMatch(/no longer on Together City/);
    // The check must come BEFORE the write it protects.
    expect(undo.indexOf('stillHere(targetId)')).toBeLessThan(undo.indexOf('datingMatch.update'));
  });

  it('keeps the two passes before this one', () => {
    // poolWhere (every list) and assertWritable (every like, connect, reveal).
    expect(svc).toMatch(/private poolWhere\([\s\S]{0,1400}?deletedAt: null/);
    const writable = svc.slice(svc.indexOf('private async assertWritable'), svc.indexOf('private async assertWritable') + 1400);
    expect(writable).toMatch(/deletedAt/);
  });
});

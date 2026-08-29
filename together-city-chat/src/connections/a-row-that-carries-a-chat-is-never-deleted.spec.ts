/**
 * The row is the gate, so nothing may delete it while the chat is alive.
 *
 * An anonymous dating conversation is authorised by its `DatingMatch` row and
 * by nothing else. `assertMatchStillStands` reads that row's status, and
 * `datingConversationIds` reads its existence to keep the thread out of the
 * ordinary Chats list and behind a pseudonym. It also, deliberately, allows a
 * conversation with NO row — a real-estate enquiry sets `anonymousTrust` and
 * never matches anybody.
 *
 * That early return is safe only while a dating row is never absent under a
 * living chat. On 27 Aug it was not: declining a People request ran
 * `purgeDatingBetween`, which deleted every row between the pair, conversation
 * or not. The thread then surfaced in both people's ordinary Chats under their
 * real names and, once the connection was removed, was writable forever. The
 * control that ends contact opened it.
 *
 * `deleteProfile` had the same defect and was fixed a day earlier — which is
 * the point of pinning the RULE here rather than either call site. This reads
 * the source of every delete against the match table and requires each one to
 * say, in its own `where`, that it only takes rows with no conversation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PURGE_RULES } from '../privacy/purge-plan';

const SRC = path.join(__dirname, '..');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) tsFiles(full, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/** Every `datingMatch.delete(...)` / `.deleteMany(...)` call, with the ~400
 *  characters after it — enough to hold the `where` without reading ahead into
 *  the next statement. */
function deleteCalls(src: string): string[] {
  const out: string[] = [];
  const re = /datingMatch\s*\.\s*(delete|deleteMany)\s*\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push(src.slice(m.index, m.index + 400));
  return out;
}

describe('nothing deletes a dating match row that carries a conversation', () => {
  const files = tsFiles(SRC);
  const found = files.flatMap((f) => deleteCalls(fs.readFileSync(f, 'utf8')).map((call) => ({ file: path.relative(SRC, f), call })));

  it('finds the delete call sites at all — a check over nothing passes vacuously', () => {
    expect(found.length).toBeGreaterThan(0);
  });

  it.each(found.map((f, i) => [`${f.file} #${i}`, f]))('%s says which rows it may take', (_label, f) => {
    // Either it names the id of a row already read as conversation-less, or it
    // filters on `conversationId: null` itself. Both appear in the tree today.
    const scoped = /conversationId:\s*null/.test(f.call) || /where:\s*\{\s*id:/.test(f.call);
    expect({ file: f.file, scopedToRowsWithNoConversation: scoped })
      .toEqual({ file: f.file, scopedToRowsWithNoConversation: true });
  });
});

/**
 * AND THE ONE DELETE THIS FILE'S REGEX CANNOT SEE.
 *
 * The nightly purge does not write `datingMatch.deleteMany` anywhere. It walks
 * PURGE_RULES and calls a generic delegate — `table.deleteMany({ where:
 * whereFor(rule, userId) })` — so the rule above swept the whole tree and
 * found every call site except the one that was breaking the invariant. It
 * passed, and it passed vacuously, for as long as the rule existed.
 *
 * Thirty days after one person deleted their account, the row classifying the
 * anonymous thread was gone — and `datingConversationIds`, which reads exactly
 * that row, stopped calling the conversation a dating conversation. It
 * surfaced in the survivor's ordinary Chats list, searchable, under a name.
 *
 * So the plan is read here as well as the source: a `purge` on this model has
 * to say, in its own filter, that it only takes rows with no conversation.
 */
describe('the purge plan is held to the same rule', () => {
  const rules = PURGE_RULES.filter((r) => r.model === 'DatingMatch');

  it('classifies the model at all', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('never purges a row without saying it takes only the conversation-less ones', () => {
    for (const r of rules.filter((x) => x.action === 'purge')) {
      expect({ action: r.action, filter: r.filter }).toEqual({ action: 'purge', filter: { conversationId: null } });
    }
  });

  it('and keeps the rest rather than leaving them unclassified', () => {
    // An unclassified row is a row the plan's own completeness check would
    // catch; a row classified `purge` with no filter is the one that got past
    // everything.
    expect(rules.some((r) => r.action === 'keep')).toBe(true);
  });
});

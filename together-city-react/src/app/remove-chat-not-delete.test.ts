import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
/** Comments explain the trap by naming it, so absence checks must read code
 *  only — a guard that matches its own documentation never goes red. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const list = strip(read('features', 'chat', 'components', 'ConversationList.tsx'));
const page = strip(read('features', 'chat', 'pages', 'Chats.tsx'));
const api = strip(read('api', 'chat.api.ts'));

/**
 * REMOVING A CHAT FROM YOUR PANEL IS NOT DELETING IT.
 *
 * The route this wires up has been on the server the whole time and does one
 * thing: it stamps clearedAt on the caller's OWN membership row. Everyone else
 * in the thread keeps it, no message is destroyed, and it returns to the panel
 * the moment somebody writes to it again.
 *
 * That gap between what the control does and what the word "delete" promises is
 * the entire risk in this change. Somebody who removes a thread believing the
 * other side lost it has been misled by our wording, and they will find out
 * when the reply arrives. So the copy is pinned here, not left to the next
 * person tidying up microcopy.
 */
describe('the left panel’s remove control', () => {
  it('says remove, and never says delete', () => {
    expect(list).toMatch(/Remove/);
    expect(list).not.toMatch(/[Dd]elete/);
  });

  it('tells you the other side keeps it, and that it can come back', () => {
    // Both halves. Either one alone is a half-truth that reads as reassurance.
    expect(list).toMatch(/stays in theirs/);
    expect(list).toMatch(/comes back here if they write again/);
  });

  it('asks before it acts, in the row rather than in a blocking dialog', () => {
    expect(list).toMatch(/confirmId/);
    expect(list).toMatch(/Keep it/);
    // window.confirm strands the whole app if it is ever left open, and the
    // repo has been moving away from it for exactly that reason.
    expect(list).not.toMatch(/window\.confirm/);
  });

  it('names the thread in the control, so a screen reader hears which one', () => {
    expect(list).toMatch(/aria-label=\{`Remove \$\{title\} from your list`\}/);
  });

  it('does not nest a button inside a button', () => {
    // The row was a single <button>. A second button inside it is invalid
    // markup that browsers resolve by guessing which one the click meant.
    const opens = list.match(/<button/g) ?? [];
    expect(opens.length).toBeGreaterThanOrEqual(3);   // open, remove, and the two confirm actions
    expect(list).toMatch(/<div key=\{c\.id\} className=\{`conv-row/);
  });
});

describe('what happens to the pane you were reading', () => {
  it('closes the thread rather than sliding you into the next one', () => {
    expect(page).toMatch(/if \(activeId === id\) setActiveId\(undefined\)/);
  });

  it('latches the open-the-first-thread fallback so it cannot re-fire', () => {
    // Without the latch, clearing activeId hands you straight to list[0] with
    // the composer still focused — a message typed for one person landing in
    // somebody else's thread.
    expect(page).toMatch(/autoPicked/);
    expect(page).toMatch(/if \(autoPicked\.current \|\| activeId/);
  });
});

describe('the API method', () => {
  it('is named for what the server does', () => {
    expect(api).toMatch(/clearConversation:/);
    expect(api).toMatch(/useClearConversation/);
    expect(api).not.toMatch(/deleteConversation/);
  });

  it('refetches the panel instead of guessing at the new list', () => {
    // The server decides what belongs in the panel — a thread with a message
    // newer than my clear stays. A client that filtered locally would show a
    // row the next poll took away.
    expect(api).toMatch(/queryKey: \['chat', 'conversations'\]/);
  });
});

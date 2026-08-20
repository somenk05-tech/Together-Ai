import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
/** Comments explain each trap by naming it, so an absence check that read them
 *  would match its own documentation and never go red. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const page = strip(read('features', 'chat', 'pages', 'Chats.tsx'));
const thread = strip(read('features', 'chat', 'components', 'MessageThread.tsx'));
const fwd = strip(read('features', 'chat', 'components', 'ForwardPanel.tsx'));
/** The window and the gesture's timings moved here when MessageThread stopped
 *  being allowed to export non-components beside components. */
const rules = strip(read('features', 'chat', 'components', 'messageRules.ts'));

/**
 * A HANDFUL OF MESSAGES CAN BE MOVED AT ONCE.
 *
 * Four things about multi-select are load-bearing and none of them are visible
 * in a screenshot of it working. They are pinned here because each one fails
 * quietly: a floating bar looks fine until a keyboard opens, a bubbling click
 * handler looks fine until somebody picks a photo, a re-stated fifteen minutes
 * looks fine for as long as the two numbers agree, and a partial
 * delete-for-everyone looks fine to everybody except the people who kept a copy.
 */
describe('the bulk bar', () => {
  it('replaces the conversation header rather than floating over the composer', () => {
    // The composer is fixed to a locked visual viewport on a phone. Anything
    // hovering above it is the one piece of chrome a keyboard will cover.
    const head = page.indexOf('className="cshead-t"');
    const composer = page.indexOf('<Composer');
    expect(head).toBeGreaterThan(-1);
    const bar = page.indexOf('{picked.length} selected');
    expect(bar).toBeGreaterThan(head);
    expect(bar).toBeLessThan(composer);
  });

  it('offers a way out of selection mode', () => {
    expect(page).toMatch(/aria-label="Cancel selection"/);
  });

  it('names how many messages each control will act on', () => {
    // "Forward" alone on a bar over nine selected messages is a button that
    // does not say what it is about to do.
    expect(page).toMatch(/Forward \$\{picked\.length\} selected message/);
    expect(page).toMatch(/Delete \$\{picked\.length\} selected message/);
  });
});

describe('deleting a selection', () => {
  it('offers "for everyone" only when every picked message is yours and still in the window', () => {
    expect(page).toMatch(/picked\.every\(\(m\) => m\.senderId === user\?\.id\)/);
    expect(page).toMatch(/picked\.every\(\(m\) => !m\.deleted && withinWindow\(m\)\)/);
  });

  it('asks for the window rather than restating it', () => {
    /* The import moved from MessageThread to messageRules — the thread now
       exports components only, which is what Fast Refresh needs. WHAT IS BEING
       PINNED HAS NOT CHANGED: the page reads the rule, it does not own a second
       copy of the number. */
    expect(page).toMatch(/import \{ withinWindow \} from '\.\.\/components\/messageRules'/);
    // A second copy of the number would look correct for exactly as long as the
    // two happened to agree.
    expect(page).not.toMatch(/15 \* 60 \* 1000/);
    expect(rules).toMatch(/export const withinWindow/);
    // And exactly one place still writes it down.
    expect(thread).not.toMatch(/15 \* 60 \* 1000/);
  });

  it('uses the thread\'s own delete wording, widened for a count', () => {
    expect(thread).toMatch(/export function ConfirmDelete/);
    expect(thread).toMatch(/count = 1/);
    expect(page).toMatch(/count=\{picked\.length\}/);
  });
});

describe('picking a message', () => {
  it('adds no second gesture — the long-press still opens the actions', () => {
    /* THE POINT SURVIVES ITS WORDING. The action bar became a floating overlay
       and the 450 moved to messageRules as HOLD_MS, but the thing this test is
       for is unchanged: press-and-hold means "show me what I can do with this
       message" and nothing else. Giving it a second meaning — entering
       selection mode — would put Reply, Keep, Copy, Edit and Info out of reach
       on a phone, because a phone has no other way to ask.

       So: one timing, in one place, and "Select messages" reached from the
       menu that timing opens. */
    expect(rules.match(/450/g) ?? []).toHaveLength(1);
    expect(thread).not.toMatch(/\b450\b/);
    // ONE timer armed, in the whole file. Two would be two meanings.
    expect(thread.match(/longPress\.current = setTimeout/g) ?? []).toHaveLength(1);
    expect(thread).toMatch(/}, HOLD_MS\)/);
    expect(thread).toMatch(/label: 'Select messages'/);
  });

  it('intercepts the tap in the capture phase', () => {
    // A bubbling handler runs after the quotation has already jumped the thread
    // and after an attachment's anchor has decided to open.
    expect(thread).toMatch(/onClickCapture=/);
    expect(thread).toMatch(/e\.preventDefault\(\); e\.stopPropagation\(\);/);
  });

  it('derives the mode from the set instead of storing a second flag', () => {
    expect(thread).toMatch(/const selecting = Boolean\(onSelect && selectedIds && selectedIds\.size > 0\)/);
  });

  it('never picks a deleted message', () => {
    expect(thread).toMatch(/const pickable = selecting && !deleted/);
  });
});

describe('forwarding several', () => {
  it('takes a list, and still sends to exactly one room', () => {
    expect(fwd).toMatch(/messages: Message\[\]/);
    expect(fwd).toMatch(/c\.id !== fromConversationId/);
  });

  it('sends them one after another so they arrive in reading order', () => {
    // Promise.all would land them in whatever order the server finished.
    expect(fwd).not.toMatch(/Promise\.all/);
    expect(fwd).toMatch(/for \(let i = 0; i < messages\.length; i\+\+\)/);
  });

  it('says how many got through when one of them fails', () => {
    expect(fwd).toMatch(/Sent \$\{i\} of \$\{messages\.length\}/);
  });
});

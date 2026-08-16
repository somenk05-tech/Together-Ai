import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** A file is allowed to explain itself; a comment naming a trap must not
 *  satisfy the check that the trap is gone. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const relief = strip(read('styles/relief.css'));
const index = strip(read('index.css'));
const chats = stripTs(read('features/chat/pages/Chats.tsx'));
const thread = stripTs(read('features/chat/components/MessageThread.tsx'));

/**
 * THE CHAT STAGE, ON A PHONE.
 *
 * From a photograph of the owner's screen: the name of the person he was
 * talking to was not on it. Measured afterwards in a browser at 320, 360, 375,
 * 390 and 430, the reason was arithmetic — the header's eight controls wanted
 * 398px before the name block was given a single pixel, so on every phone made
 * the name was zero wide and `online`, being the shorter string, was the only
 * thing left of who was in the room. Below 372px the video key was cut off the
 * end of the row.
 *
 * Nothing here is a matter of taste; each assertion pins a measurement that a
 * later edit could silently undo. The failure mode of all four is the same and
 * it is the reason this file exists: the screen goes on looking like a chat.
 */
describe('the header keeps the name', () => {
  /** The phone block, isolated, so a rule elsewhere cannot satisfy these. */
  const phone = (() => {
    const at = relief.indexOf('@media (max-width: 899px) {\n  .cstage .cshead-t');
    expect({ found: at >= 0 }).toEqual({ found: true });
    return relief.slice(at, relief.indexOf('\n}', at));
  })();

  it('drops the avatar, which was saying what the name says', () => {
    // A phone shows one room at a time and the name sits directly above the
    // thread. The disc cost 42px and one gap to repeat it.
    expect(phone).toMatch(/\.cstage \.cshead-t > \.csav \{ display: none; \}/);
  });

  it('tightens the row rather than letting it run off the end', () => {
    expect(phone).toMatch(/\.cstage \.cshead-t \{ gap: 8px; padding: 10px 12px; \}/);
  });

  it('scales her lockup in the stylesheet, not in the page', () => {
    // mira-reads-one-chat.test.ts pins `<MiraMark size={48} state="waiting" />`
    // as a literal, and 48 is the size the word stops being legible below on a
    // desk. Shrinking the prop for a phone would put the page and that test in
    // disagreement about the same mark.
    expect(phone).toMatch(/\.mira-door > svg \{ width: 34px; height: 34px; \}/);
    expect(chats).toMatch(/<MiraMark size=\{48\} state="waiting" \/>/);
  });
});

describe('the two keys a phone folds away', () => {
  it('folds them behind one ⋯ rather than removing them', () => {
    // "Mark unread" is reachable from nowhere else in the application — not
    // from the conversation list, not from a row menu. Dropping it from the
    // phone header would not have been a trim, it would have been a feature a
    // phone does not have.
    expect(chats).toMatch(/aria-label="More actions in this conversation"/);
    expect(chats).toMatch(/aria-haspopup="menu"/);
    expect(chats).toMatch(/role="menu"/);
    // The label of the ROW, not the aria-label of the desk's key — those two
    // read the same and only one of them is the fold.
    expect(chats).toMatch(/<\/span>Search this conversation/);
    expect(chats).toMatch(/<\/span>Mark unread/);
  });

  it('still gives a desk the two keys themselves', () => {
    // The fold is the phone's answer to a phone's problem. A desk has the room
    // and should not have to open a menu to search a conversation.
    expect(chats).toMatch(/phone \? \(/);
    expect(chats).toMatch(/aria-label="Leave this conversation unread"/);
    expect(chats).toMatch(/aria-label="Search this conversation"/);
  });

  it('closes on a press away, on Escape, and on choosing', () => {
    expect(chats).toMatch(/className="cshead-more-scrim" aria-hidden/);
    expect(chats).toMatch(/e\.key === 'Escape'.*setMoreOpen\(false\)/s);
    // …and when the thread changes underneath it. A menu that survives going
    // back to the list is a menu that opens by itself in the next room.
    expect(chats).toMatch(/setSearchOpen\(false\); setMoreOpen\(false\);/);
  });

  it('gives each row of the menu a 44px target, stated', () => {
    const rule = relief.slice(relief.indexOf('.cshead-menu button {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/min-height: 44px/);
  });
});

describe('the thread moves up and down and nowhere else', () => {
  it('locks the axis instead of leaving overflow-x at its default', () => {
    // `overflow-y: auto` alone leaves overflow-x computing to `auto`, not
    // `visible` — so anything a shade too wide became a thread you could pan
    // sideways off the edge of the room.
    const rule = relief.slice(relief.indexOf('.csmsgs {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/overflow-x: hidden/);
  });

  it('breaks a token with no break in it rather than pushing the room', () => {
    const rule = relief.slice(relief.indexOf('\n.csb {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/overflow-wrap: anywhere/);
  });
});

describe('the measure of a bubble belongs to the stylesheet', () => {
  it('is not overridden inline by a row that claims the whole width', () => {
    // An inline style outranks every rule in the cascade. `maxWidth: '100%'`
    // beat `min(66%, 560px)` on a desk AND 86% on a phone, so every long
    // message ran the full width of the stage — and a row that wide cannot
    // read as right-aligned however `align-self` is set. This is the defect in
    // the photograph: outgoing bubbles going edge to edge.
    expect(thread).not.toMatch(/maxWidth: m\.share \? 320 : '100%'/);
    expect(thread).toMatch(/\.\.\.\(m\.share \? \{ maxWidth: 320 \} : null\)/);
  });

  it('keeps a phone its own measure, in the file that wins the tie', () => {
    // relief.css is imported after index.css, so at equal specificity relief
    // takes it. The phone's 86% sat in index.css from 10 Aug and had never
    // once applied; a phone was reading at the desk's 66% and inside the
    // desk's 24px gutters the whole time.
    const main = stripTs(read('main.tsx'));
    expect(main.indexOf("'./index.css'")).toBeLessThan(main.indexOf("'./styles/relief.css'"));
    expect(relief).toMatch(/\.cstage \.csmsgs > div > \.tc-msg-row \{ max-width: 86%; \}/);
    expect(relief).toMatch(/\.cstage \.csmsgs \{ padding: 14px 14px 6px; \}/);
  });

  it('leaves no copy behind in index.css to disagree with it', () => {
    // The rule that never fired is worse than no rule: it reads as the phone's
    // measure to anybody looking for it, and it is where two people already
    // went to change a number that could not move.
    expect(index).not.toMatch(/\.csmsgs > div > \.tc-msg-row/);
    expect(index).not.toMatch(/\n\s*\.csmsgs \{ padding/);
  });
});

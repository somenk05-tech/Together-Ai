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

  it('keeps the face, and pays for it out of the controls', () => {
    // THIS ASSERTION USED TO SAY THE OPPOSITE. The disc was `display: none`
    // here from 16 Aug, on the argument that a phone shows one room at a time
    // and the name above the thread already said whose it was. The owner
    // looked at it on 20 Aug and disagreed, and he is right: a photograph is
    // not a second copy of the name, it is the one thing on this row that says
    // whose room this is without being read — and it is the SAME picture the
    // list outside shows, so losing it here made the two screens two apps.
    //
    // The budget the old rule was protecting is real, so it is found elsewhere
    // instead: 32px for the face, 34 for each key, 36 for her mark, 6px gaps.
    expect(phone).not.toMatch(/\.cstage \.cshead-t > \.csav \{ display: none/);
    expect(phone).toMatch(/\.cstage \.cshead-t > \.csav \{ width: 32px; height: 32px;/);
    expect(phone).toMatch(/\.cstage \.cshead-t \.cstool \{ width: 34px; height: 34px;/);
  });

  it('tightens the row rather than letting it run off the end', () => {
    expect(phone).toMatch(/\.cstage \.cshead-t \{ gap: 6px; padding: 10px 12px; \}/);
  });

  it('finds the last twenty pixels on the narrowest phones', () => {
    // Measured: at 320 the block above leaves the name 58px, which renders
    // "Shru…" — and the name is the one thing this header may not give up. A
    // second, narrower block takes 20px back in the same order: the gaps, then
    // the face, then the keys. Nothing is removed; the name goes back to 78px.
    const narrow = (() => {
      const at = relief.indexOf('@media (max-width: 374px) {');
      expect({ found: at >= 0 }).toEqual({ found: true });
      return relief.slice(at, relief.indexOf('\n}', at));
    })();
    expect(narrow).toMatch(/\.cstage \.cshead-t \{ gap: 4px; \}/);
    expect(narrow).toMatch(/\.cstage \.cshead-t > \.csav \{ width: 28px/);
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
    expect(relief).toMatch(/\.cstage \.csmsgs > div > \.tc-msg-row \{ max-width: 84%; \}/);
    // 6px of floor was the whole clearance between the newest bubble and the
    // composer, and the composer had no bottom margin of its own (see
    // `.csdock`) — so the last message read as tucked under the bar. That is
    // the crop in the second photograph the owner sent.
    expect(relief).toMatch(/\.cstage \.csmsgs \{ padding: 14px 12px 12px; \}/);
  });

  it('leaves no copy behind in index.css to disagree with it', () => {
    // The rule that never fired is worse than no rule: it reads as the phone's
    // measure to anybody looking for it, and it is where two people already
    // went to change a number that could not move.
    expect(index).not.toMatch(/\.csmsgs > div > \.tc-msg-row/);
    expect(index).not.toMatch(/\n\s*\.csmsgs \{ padding/);
  });
});

/**
 * THE COMPOSER SAT ON THE BOTTOM EDGE OF THE PHONE.
 *
 * Four `.cscomposer` margins were written for this — the 20px sides, the
 * safe-area bottom, the immersive room's 14, the phone's 12 — and not one of
 * them had ever applied, because the <form> carries `style={{ margin: 0 }}`
 * inline and its wrapper carried an inline `margin: '0 20px 0'`. An inline
 * style outranks the cascade, so the real spacing was that wrapper's: 20px at
 * the sides and NOTHING underneath. On an iPhone the send key sat in the home
 * indicator; above it the thread's own floor was 6px.
 *
 * The wrapper wears `.csdock` now and the numbers are in the stylesheet.
 */
describe('the composer keeps its own floor', () => {
  const composer = stripTs(read('features/chat/components/Composer.tsx'));

  it('does not set its gutter inline, where no stylesheet can reach it', () => {
    expect(composer).not.toMatch(/margin: '0 20px 0'/);
    expect(composer).toMatch(/<div className="csdock">/);
  });

  it('clears the home indicator, on the phone and in the immersive room', () => {
    const rule = relief.slice(relief.indexOf('.csdock {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/margin: 0 20px calc\(20px \+ var\(--safe-bottom\)\)/);
    // …and it is the flex child of the immersive column, so it is the thing
    // that must refuse to shrink.
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/flex: 0 0 auto/);
    expect(index).toMatch(/html\.tc-immersive \.csdock \{ margin-bottom: calc\(var\(--safe-bottom\) \+ 12px\); \}/);
    expect(index).toMatch(/html\.tc-immersive \.cshead-t, html\.tc-immersive \.csdock \{ flex: 0 0 auto; \}/);
  });
});

/**
 * THE FACE IS THE SAME FACE, INSIDE THE ROOM AND OUTSIDE IT.
 *
 * The owner, 20 Aug: profile photos on the chat page, the same as outside. The
 * roster is already one cached call for the whole screen — the thread is handed
 * the picture the header is drawing, rather than fetching it a second time.
 */
describe('a face inside the room', () => {
  const thread2 = stripTs(read('features/chat/components/MessageThread.tsx'));

  it('draws the photo on the attribution line, with initials as the fallback', () => {
    expect(thread2).toMatch(/<span className="csav csface" aria-hidden>/);
    expect(thread2).toMatch(/peerPhoto\s*\n?\s*\? <img className="no-case" src=\{peerPhoto\}/);
    expect(thread2).toMatch(/: initials\(peerName\)/);
    expect(relief).toMatch(/\.csatt \.csface \{ width: 26px; height: 26px;/);
  });

  it('is handed the roster’s picture rather than fetching its own', () => {
    expect(chats).toMatch(/peerName=\{activeTitle\} peerPhoto=\{activePhoto\}/);
    // activePhoto is already the masked-aware one the header uses, so an
    // anonymous match’s thread cannot draw a face the list is withholding.
    expect(chats).toMatch(/activeConv\?\.anonymous && !activeFace\?\.mine \? null : activeFace\?\.photo \?\? null/);
  });

  it('sits on the line rather than hanging off its baseline', () => {
    const rule = relief.slice(relief.indexOf('.csatt {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/align-items: center/);
  });
});

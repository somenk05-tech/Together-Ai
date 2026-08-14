import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * A DARK STAGE DOES NOT EXPORT ITS INK.
 *
 * This shipped, reached production, and was found by the owner looking at his
 * own chat: the "New chat" dialog listed four people whose names were
 * invisible, and every shared card in the thread had a title nobody could
 * read. Both render their own WHITE ground and both inherit `color` — and the
 * nearest ancestor setting colour was `.cstage`, which sets it to near-white.
 * Near-white on white is 1.05:1.
 *
 * Nothing caught it: the typecheck passed, all 417 tests passed, and the
 * contrast work done for the stage measured the stage's own text against the
 * stage's own grounds. It never looked at a surface sitting ON the stage that
 * carried a different one.
 *
 * The general rule, and the reason this is a file rather than two edits: a
 * component that paints its own background must paint its own foreground.
 * Inheriting colour is right between elements that share a ground and wrong
 * between elements that do not — and "which ground am I on" is exactly the
 * thing a component cannot know from the inside.
 */
describe('A dark stage does not export its ink', () => {
  const relief = strip(read('src/styles/relief.css'));

  /** The stage sets `color`, which is what makes the reset necessary. If that
   *  ever stops being true the rest of this file becomes theatre, so it is
   *  checked rather than assumed. */
  it('is guarding a stage that really does set a colour', () => {
    expect(relief).toMatch(/\.cstage\s*\{[^}]*color:\s*var\(--on-stage\)/);
  });

  /** `.card` is the one class here that always means "a white sheet". Every
   *  dialog and every shared card inside the stage wears it, so restoring the
   *  ink there once covers the ones nobody has written yet. */
  it('restores the city ink on any card sitting on the stage', () => {
    expect(relief).toMatch(/\.cstage\s+\.card\s*\{[^}]*color:\s*var\(--ink\)/);
    /* …and the quiet tones with it: --on-stage-faint is #a8adb3, which is
       4.8:1 on the stage and 2.0:1 on a white card. */
    expect(relief).toMatch(/\.cstage\s+\.card\s+\.muted[^{]*\{[^}]*color:\s*var\(--muted\)/);
  });

  /**
   * AND THE SHARED CARD DOES NOT INHERIT AT ALL. ShareCardView paints
   * `background: var(--card)` and used `color: 'inherit'`, so it rendered in
   * whatever ink surrounded it. That was only ever correct by luck — every
   * surface it had landed on before happened to be white too.
   */
  it('never lets the shared card inherit the ink of wherever it landed', () => {
    const src = strip(read('src/features/chat/share.tsx'));
    const shell = src.slice(src.indexOf('const shell'), src.indexOf('const body'));
    expect(shell).toContain("background: 'var(--card)'");
    expect(shell).toContain("color: 'var(--ink)'");
    expect(shell).not.toMatch(/color:\s*'inherit'/);
  });

  /**
   * NO COMPONENT ON THE STAGE PAINTS A LIGHT GROUND WITHOUT AN INK. If a chat
   * component sets a light background in a style object it must set a colour
   * in the SAME object — otherwise it is this defect in different syntax, and
   * the `.cstage .card` reset cannot reach it because it is not a card.
   */
  it('pairs every light ground with an ink in the chat components', () => {
    const FILES = [
      'src/features/chat/components/ChatStarter.tsx',
      'src/features/chat/components/ConversationList.tsx',
      'src/features/chat/components/MessageThread.tsx',
      'src/features/chat/components/Composer.tsx',
      'src/features/chat/pages/Chats.tsx',
      'src/features/chat/share.tsx',
    ];
    const LIGHT = /background:\s*'var\(--(card|paper|wash|well|face|face-key|accent-soft)\)'/;
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = strip(read(f)).replace(/(^|[^:])\/\/.*$/gm, '$1 ');
      for (const m of src.matchAll(/style=\{\{([^{}]*)\}\}/g)) {
        if (LIGHT.test(m[1]) && !/(^|[^-\w])color:/.test(m[1])) offenders.push(`${f} → ${m[1].trim().slice(0, 64)}`);
      }
      for (const m of src.matchAll(/:\s*React\.CSSProperties\s*=\s*\{([\s\S]*?)\n\s*\};/g)) {
        if (LIGHT.test(m[1]) && !/(^|[^-\w])color:/.test(m[1])) offenders.push(`${f} → a CSSProperties object with a ground and no ink`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  /**
   * AND THE RULE APPLIES ONE LEVEL DOWN, TO MIRA'S ROOM.
   *
   * The stage exports near-white ink. Mira's thread sits ON the stage and now
   * paints a RED ground of its own — so it is the same shape as `.card`, and it
   * shipped with the same defect in both directions before this was written:
   * her opening paragraph asked for `--ink-soft` (#1c1c1c on #26282b, 1.2:1)
   * while her bubbles painted `--card` white and let the stage's near-white
   * type land on it.
   *
   * A component cannot know what ground it is on. It CAN know whether it
   * painted one — and that is the thing this checks.
   */
  const mira = strip(read('src/styles/mira.css'));

  it('gives Mira\'s room its own ground and its own ink, together', () => {
    const thread = mira.slice(mira.indexOf('.mirathread {'));
    const block = thread.slice(0, thread.indexOf('}'));
    expect(block).toMatch(/background:\s*var\(--mira-ground\)/);
    expect(block).toMatch(/(^|[^-\w])color:\s*var\(--on-mira\)/);
  });

  /**
   * NO LIGHT TILE IN THAT ROOM WITHOUT AN INK OF ITS OWN. `--on-mira` is a
   * near-white ground when it is used as one — the citizen's bubble, the send
   * button, the live microphone — and inheriting `--on-mira` onto it is
   * near-white on near-white, which is this whole file's defect wearing the
   * new palette.
   */
  it('pairs every light tile in Mira\'s room with an ink', () => {
    const LIGHT = /background(-color)?:\s*var\(--(on-mira|card|paper)\)/;
    const offenders: string[] = [];
    for (const block of mira.split('}')) {
      const [selector, body] = [block.split('{')[0]?.trim(), block.split('{')[1]];
      if (!body || !LIGHT.test(body)) continue;
      if (!/(^|[^-\w])color:/.test(body)) offenders.push(selector);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * AND THE CITY'S OWN INKS STAY OUT. `--ink`, `--ink-soft`, `--muted` and
   * `--faint` are all near-black: correct on white paper, invisible in a red
   * room. The one exception is Mira's ROW, which is not in the room — it sits
   * on the stage, and wears the white tile the stage gives a selected row.
   */
  it('keeps the city\'s near-black inks out of the red room', () => {
    const room = mira.slice(mira.indexOf('.mirathread {'));
    const found = [...new Set(room.match(/var\(--(ink|ink-soft|muted|faint)\)/g) ?? [])];
    expect(found).toEqual([]);
  });
});

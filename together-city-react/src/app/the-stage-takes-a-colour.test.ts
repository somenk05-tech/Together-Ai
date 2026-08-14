import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE STAGE TAKES A COLOUR.
 *
 * Eight palettes from the owner's cards — Navy Mirage, Emerald Depth,
 * Mandarin Curd, Rose Mascarpone, Peach Glaze, Pistachio Mint Cream,
 * Lavender Cream, Cream Veil — plus the slate default. One tap on a swatch
 * beside the Chats header re-grounds the whole chat system.
 *
 * The rule this file holds is the one `a-stage-does-not-export-its-ink`
 * taught: A THEME IS ALL ELEVEN TOKENS OR IT IS NOT A THEME. A block that
 * re-points the ground and inherits the previous ink ships invisible type
 * in whichever direction the ground moved — so every block below must
 * re-state the full set. And Mira takes no theme: her room stays red.
 */
const THEMES = ['navy', 'emerald', 'mandarin', 'rose', 'peach', 'pistachio', 'lavender', 'cream'];
const TOKENS = [
  /--stage:\s/, /--stage-panel:/, /--stage-tile:/, /--stage-hover:/,
  /--stage-well:/, /--stage-line:/, /--stage-solid:/,
  /--on-stage:\s/, /--on-stage-soft:/, /--on-stage-faint:/, /--on-stage-ink:/,
];

describe('the stage takes a colour', () => {
  const tokens = read('styles/tokens.css');
  const chats = read('features/chat/pages/Chats.tsx');

  it('every theme is all eleven tokens, together', () => {
    for (const id of THEMES) {
      const m = new RegExp(`\\.cstage\\[data-stage="${id}"\\]\\s*\\{([^}]*)\\}`).exec(tokens);
      expect({ theme: id, present: Boolean(m) }).toEqual({ theme: id, present: true });
      const block = m?.[1] ?? '';
      for (const t of TOKENS) {
        expect({ theme: id, token: String(t), stated: t.test(block) })
          .toEqual({ theme: id, token: String(t), stated: true });
      }
    }
  });

  it('no theme touches Mira — her room stays red', () => {
    for (const id of THEMES) {
      const block = new RegExp(`\\.cstage\\[data-stage="${id}"\\]\\s*\\{([^}]*)\\}`).exec(tokens)?.[1] ?? '';
      expect({ theme: id, touchesMira: /--(on-)?mira/.test(block) })
        .toEqual({ theme: id, touchesMira: false });
    }
  });

  it('the choice rides the stage as data-stage, and survives the visit', () => {
    expect(chats).toMatch(/data-stage=\{stageTheme\}/);
    expect(chats).toMatch(/localStorage\.setItem\(THEME_KEY, id\)/);
    // An unknown stored value falls back to slate rather than to a ground
    // with no block and therefore no measured ink.
    expect(chats).toMatch(/STAGE_THEMES\.some\(\(s\) => s\.id === t\) \? \(t as StageTheme\) : 'slate'/);
  });

  it('the swatches say their names, and say which one is worn', () => {
    expect(chats).toMatch(/aria-label=\{`Colour: \$\{t\.name\}`\}/);
    expect(chats).toMatch(/aria-pressed=\{stageTheme === t\.id\}/);
    for (const name of ['Navy Mirage', 'Emerald Depth', 'Mandarin Curd', 'Rose Mascarpone', 'Peach Glaze', 'Pistachio Mint Cream', 'Lavender Cream', 'Cream Veil']) {
      expect(chats).toContain(name);
    }
  });

  it('a 22px dot still takes a 44px finger', () => {
    const relief = read('styles/relief.css');
    const block = relief.slice(relief.indexOf('.cstheme button::after'));
    expect(block.slice(0, block.indexOf('}'))).toMatch(/min-width: 44px; min-height: 44px/);
  });
});

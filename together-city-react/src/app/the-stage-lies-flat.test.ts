import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE STAGE LIES FLAT.
 *
 * The owner, looking at Rose Mascarpone in production: "remove the raised
 * feel of the chats and make everything flat... inside the chat box." He was
 * right about why, too — the neumorphic pair was mixed for the near-black
 * stage, and on the light themes its dark drops read as smudges under every
 * bubble. Colour says who spoke; depth said it twice.
 *
 * So no surface inside the chat box wears the soft shadows any more: not the
 * bubbles, not the selected row, not the tools, the day pill, the composer
 * or the send key. The tokens themselves stay defined — the profile's dark
 * column still uses them — but the chat rules may not reach for them, and
 * this file is what holds that.
 */
describe('the stage lies flat', () => {
  const relief = read('styles/relief.css');
  const block = (selector: string): string => {
    const at = relief.indexOf(`\n${selector} {`);
    expect({ selector, present: at >= 0 }).toEqual({ selector, present: true });
    const body = relief.slice(at, relief.indexOf('}', at));
    return body;
  };

  it('no chat surface reaches for the soft shadows', () => {
    for (const s of ['.csrow.on', '.cstool', '.csday', '.csb', '.csb.me', '.cscomposer', '.cscomposer .cssend']) {
      expect({ selector: s, flat: !/var\(--soft-/.test(block(s)) })
        .toEqual({ selector: s, flat: true });
    }
  });

  it('and the search field does not smuggle one back inline', () => {
    const chats = read('features/chat/pages/Chats.tsx');
    expect(chats).not.toMatch(/soft-in|soft-out|soft-tile/);
  });
});

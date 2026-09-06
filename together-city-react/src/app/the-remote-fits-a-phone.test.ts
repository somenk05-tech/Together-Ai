import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * THE REMOTE FITS A PHONE — owner, 6 Sep, with a photograph of it not doing so:
 * "adjust the player for mobile in one row, make it sleeker and smaller...
 * also remove these two extra buttons."
 *
 * Eight 44px keys and a 44px television glyph is 440px of controls in a bar
 * that can only be as wide as the screen minus its margins. On a 390px phone
 * the row wrapped, the glyph took a line of its own, and the last key was cut
 * off at the edge.
 */
describe('the television remote', () => {
  const tv = code('features/social/CityTV.tsx');
  const css = read('styles/social.css');
  const phone = css.slice(css.indexOf('@media (max-width: 899px)'));

  it('has no picture of a television on it', () => {
    // A 44px mark at the head of the keys, on a television.
    expect(tv).not.toMatch(/tv-mark/);
    expect(css).not.toMatch(/^\.tv-mark/m);
  });

  it('has no caption key, and shows the caption', () => {
    /**
     * The key toggled the poster's own words on and off; they were on, which
     * is what it defaulted to. With the key gone the state went too — a
     * useState nothing can set is a constant wearing a hook.
     */
    expect(tv).not.toMatch(/setCaptions|Show the caption/);
    expect(tv).toMatch(/\{\(caption \|\| post\.placeName\) && \(/);
  });

  it('keeps the eight keys that do something', () => {
    for (const label of ['Previous video', 'Next video', 'Full screen',
      'Together City Channels', "What's next", 'Volume', 'Turn the video upright']) {
      expect({ label, kept: tv.includes(label) }).toEqual({ label, kept: true });
    }
    // Play/pause is written as an expression, so the keys are counted rather
    // than matched: eight in the row (the rotate key joined on 6 Sep), no ninth.
    const row = tv.slice(tv.indexOf('<div className="tv-keys">'), tv.indexOf('</div>', tv.indexOf('<div className="tv-keys">')));
    expect((row.match(/className="tv-key"/g) ?? []).length).toBe(8);
  });

  it('sizes the keys so eight fit one row on the narrowest phone', () => {
    // 8 x 36 + 7 x 3 = 309px, plus the channel's face, inside a 360px
    // screen's bar with its padding. 44px keys are 380 + padding, which is
    // what wrapped; 38px keys fitted seven and not the eighth.
    expect(phone).toMatch(/\.tv-key \{ width: 36px; height: 36px; \}/);
    expect(phone).toMatch(/\.tv-keys \{ gap: 3px; \}/);
    // The up/down dial does not fit beside eight keys and a face; it goes on
    // a phone, and the channels page and the arrow keys still tune.
    expect(phone).toMatch(/\.tv-dial \{ display: none; \}/);
  });

  it('spends no line of the remote on a label', () => {
    // CHANNEL over a face and a name. The keys beside it keep their own
    // aria-labels, so this is hidden from the eye and not from a reader.
    expect(phone).toMatch(/\.tv-channel-l \{ display: none; \}/);
    expect(tv).toMatch(/aria-label="Previous channel"/);
  });
});

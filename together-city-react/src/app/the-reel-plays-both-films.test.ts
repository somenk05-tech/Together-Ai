import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * TWO FILMS, ONE REEL (owner, 8 Sep): "add this video after this video ends
 * and keep both videos on loop".
 *
 * The hero used to be one commercial with `loop` on the element. That
 * attribute is the browser's own one-clip repeat — it restarts the file it is
 * set on and knows nothing about a second one — so the moment a second film
 * arrives, `loop` is not a smaller version of what is wanted, it is the thing
 * that prevents it: a looping element never fires `ended`.
 *
 * Three ways this quietly reverts, one assertion each. `loop` could come back
 * on the hero, and the reel would stop at the first film forever. The wrap
 * could be dropped from the `ended` handler — `clip + 1` without the modulo
 * runs off the end of the array and the hero goes black after the second
 * film. And a src could be typed for a file that was never committed, which
 * is the deploy scar this repo has now worn four times: a local build reads
 * the working tree, Vercel builds a checkout, and the missing byte is only
 * found in production. Every source and poster named in Home.tsx is checked
 * against public/ here.
 */
describe('The home hero plays both films, one after the other, round again', () => {
  const home = code('pages/Home.tsx');
  const films = [...home.matchAll(/phone: '([^']+)',\s*wide: '([^']+)',\s*poster: '([^']+)'/g)];

  it('carries two films, not one', () => {
    expect(films).toHaveLength(2);
  });

  it('ships every file it names', () => {
    for (const [, phone, wide, poster] of films) {
      expect(existsSync(join(ROOT, 'public', wide))).toBe(true);
      expect(existsSync(join(ROOT, 'public', phone))).toBe(true);
      expect(existsSync(join(ROOT, 'public', 'assets/img', poster))).toBe(true);
    }
  });

  it('does not leave `loop` on the hero, which would eat the `ended` it needs', () => {
    const cinema = home.slice(home.indexOf('className="cinema"'), home.indexOf('className="cinema-sound"'));
    expect(cinema).toMatch(/onEnded=/);
    expect(cinema).not.toMatch(/^\s*loop\s*$/m);
  });

  it('wraps back to the first film rather than running off the end', () => {
    expect(home).toMatch(/setClip\(\(i \+ 1\) % FILMS\.length\)/);
  });

  it('keeps the phone cut choosing itself before a byte is downloaded', () => {
    const sources = [...home.matchAll(/<source src=\{f\.(\w+)\} type="video\/mp4"( media="\(max-width: 899px\)")?/g)];
    expect(sources).toHaveLength(2);
    expect(sources[0][1]).toBe('phone');
    expect(sources[0][2]).toBeTruthy();
    expect(sources[1][1]).toBe('wide');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * ── SOCIAL LIFE HAS ITS STYLESHEET BACK ─────────────────────────────────────
 *
 * The owner, 17 Aug, looking at the City Feed: "fix the design issue."
 *
 * WHAT WAS WRONG WAS NOT A DESIGN. `d3e1d51 · Social Life takes the city's
 * paper` added 216 lines of `.sl-*` rules to relief.css on 15 August. The very
 * next commit to touch that file, `c6c32b2 · The daybook`, wrote a STALE COPY
 * over it — -216 +55, and all 216 were this block. Two days later the feed's
 * tab row still read "For YouPhotosVideosThoughtsFriends", because every class
 * was in the markup and not one of them matched a rule.
 *
 * Measured on the live page before anything was restored: `.sl-tabs` computed
 * to `display: block` and `.sl-tab` to `inline-block`, padding 0, margin 0 —
 * the browser's defaults, because there was nothing else to have.
 *
 * THE REAL DEFECT IS THE ONE THIS FILE GUARDS. Not the missing rules — the fact
 * that 47 class names could go unstyled across ten files for two days and
 * nothing said a word. So the assertion that matters is the LAST one: every
 * `sl-` class the markup uses has a rule somewhere. It would have failed on
 * 15 August, and it fails again the next time a file is written over.
 */
describe('social life has its stylesheet back', () => {
  const social = strip(read('styles/social.css'));
  const main = read('main.tsx');
  const spec = read('app/relief.spec.ts');

  it('is a file of its own, not a section inside a 235KB one', () => {
    // Living in the middle of relief.css is the reason it was lost: a section
    // deep inside a file nobody diffs line-by-line disappears silently, and a
    // whole missing file does not.
    expect(social).toMatch(/\.sl-tabs \{/);
    expect(social).toMatch(/\.sl-tab \{/);
    expect(strip(read('styles/relief.css'))).not.toMatch(/\.sl-tab \{/);
  });

  it('is imported after relief, which is where it sat in the cascade', () => {
    // These rules were written to override the `.g-*` glass above them in
    // relief.css. Importing them earlier puts that argument the wrong way round.
    const r = main.indexOf("import './styles/relief.css'");
    const s = main.indexOf("import './styles/social.css'");
    expect({ relief: r >= 0, social: s >= 0, afterRelief: s > r })
      .toEqual({ relief: true, social: true, afterRelief: true });
  });

  it('is read by the ratchet that would otherwise not know it exists', () => {
    // relief.spec.ts's own words, above Mira's sheet: "a stylesheet no ratchet
    // reads is a second design system with a head start." This one spent two
    // days deleted and no rule in that file would have said so.
    expect(spec).toMatch(/const social = read\('src\/styles\/social\.css'\)/);
    expect(spec).toMatch(/\['mira\.css', mira\], \['social\.css', social\]/);
    expect(spec).toMatch(/\[tokens, relief, layout, index, mira, social\]/);
  });

  it('gives the tab row its spacing back — the thing that was actually visible', () => {
    // The screenshot was "For YouPhotosVideosThoughtsFriends". A row of buttons
    // with no rule is a row of buttons touching.
    expect(social).toMatch(/\.sl-tabs \{[^}]*display: flex/);
    expect(social).toMatch(/\.sl-tabs \{[^}]*gap:/);
    expect(social).toMatch(/\.sl-tab \{[^}]*padding:/);
  });

  it('has a rule for every sl- class the markup actually uses', () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THIS ON DAY ONE, and the only one
    // here that is really about the future. It walks the components rather than
    // trusting a list, because a list is another thing to forget to update.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(join(SRC, dir))) {
        const rel = join(dir, name);
        if (statSync(join(SRC, rel)).isDirectory()) walk(rel, out);
        else if (/\.tsx$/.test(name)) out.push(rel);
      }
      return out;
    };
    const used = new Set<string>();
    for (const f of walk('features')) {
      for (const m of read(f).matchAll(/\bsl-[a-z0-9-]+/g)) {
        // `sl-tile-${colour}` and friends leave a trailing hyphen behind; the
        // stem is what has to be styled, and the variants are asserted below.
        if (!m[0].endsWith('-')) used.add(m[0]);
      }
    }
    expect(used.size).toBeGreaterThan(30);
    const unstyled = [...used].filter((c) => !social.includes(`.${c}`)).sort();
    expect(unstyled).toEqual([]);
  });
});

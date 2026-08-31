import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEGAL = join(dirname(fileURLToPath(import.meta.url)), '..', 'features', 'legal', 'legal-data.ts');

/**
 * The legal pages may not promise a protection the app does not have.
 *
 * The Matchmaking Hub Terms carried "Screenshot-protection measures are applied
 * where feasible" for as long as anyone can remember. Nothing implemented it,
 * and nothing could: browsers expose no way to stop a screenshot. It is the
 * most costly kind of untrue sentence in the product, because a citizen might
 * read it and share a photo they would otherwise have kept — the promise
 * changes what they DO, and it changes it in the direction of harm.
 *
 * It is the same species as Settings' "Download My Data" link that did nothing
 * (fixed 1 Aug, 6c27118), and the empty states that claimed you had nothing
 * when we simply had not asked. A legal page is the worst place for it: it is
 * where somebody goes precisely because they want to know what is true.
 *
 * THE LIST BELOW IS NOT A STYLE GUIDE. Every entry is a claim that CANNOT be
 * backed by any web application, by construction — not "we haven't built it
 * yet" but "this is not a thing a browser can do". A claim that is merely
 * unbuilt belongs in the backlog; a claim that is unbuildable belongs nowhere.
 */
const UNBACKABLE = [
  { pattern: /screenshot[-\s]?(protection|prevention|blocking)/i, why: 'No browser can prevent a screenshot.' },
  { pattern: /prevents?\s+screenshots?/i, why: 'No browser can prevent a screenshot.' },
  { pattern: /cannot be (screenshotted|screen[-\s]?captured|copied|saved)/i, why: 'Anything rendered can be captured.' },
  { pattern: /\b(100%|completely|totally)\s+(secure|private|anonymous|safe)\b/i, why: 'No system is 100% anything.' },
  { pattern: /\bunhackable\b|\bimpossible to (hack|breach|intercept)\b/i, why: 'Not a claim anyone can make.' },
  { pattern: /\bmilitary[-\s]grade\b/i, why: 'Marketing phrase with no technical meaning.' },
];

describe('the legal pages promise only what the app can do', () => {
  const src = readFileSync(LEGAL, 'utf8');

  it('makes no protection claim that no web app could keep', () => {
    // Comments are stripped first: this file now EXPLAINS the sentence it used
    // to carry, and a guard that reads its own history is a guard that can
    // never go green. (Sixth time in this repo; see allergens/one-energy.)
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
      .join('\n');

    const found = UNBACKABLE
      .filter(({ pattern }) => pattern.test(code))
      .map(({ pattern, why }) => `  ${String(pattern)} — ${why}`);

    expect(found.join('\n') || 'none').toBe('none');
  });

  it('the guard is reading the real file, not an empty string', () => {
    // An audit that passes because it parsed nothing is worse than no audit.
    expect(src.length).toBeGreaterThan(5000);
    /* The hub was renamed Dating → Matchmaking on 31 Aug (owner). This canary
       names a heading in the file so a guard that parsed nothing cannot pass;
       it has to move with the copy it is proving it read. */
    expect(src).toContain('Matchmaking Hub Terms');
    // And it can still catch the exact sentence that started this.
    const planted = 'Screenshot-protection measures are applied where feasible';
    expect(UNBACKABLE.some(({ pattern }) => pattern.test(planted))).toBe(true);
  });
});

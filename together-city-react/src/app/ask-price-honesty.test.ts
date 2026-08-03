import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASK = join(HERE, '..', 'features', 'astrology', 'pages', 'AstroAsk.tsx');
const API = join(HERE, '..', 'features', 'astrology', 'api.ts');

/**
 * The screen never names a price it was not given.
 *
 * Consultations are five free and then ₹100 for the next five, and the number
 * that decides the charge is a counter on the server. The moment this page
 * writes ₹100 of its own, there are two opinions about the price and only one
 * of them takes money — and the day the price changes, the wrong one is the one
 * the citizen reads before pressing the button.
 *
 * The page held exactly that shape until now, in good faith: `const PRICE:
 * number = 0`, a mirror of the API's constant, correct on the day it was
 * written. It survived the paywall coming down because zero happened to be
 * right on both sides. A mirror is only ever a bug that has not been triggered.
 *
 * COMMENTS ARE STRIPPED FIRST. Explaining the pricing in a comment is exactly
 * what a comment is for, and a guard that cannot tell prose from code teaches
 * people to stop writing prose.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

describe('what a consultation costs is the server\'s to say', () => {
  it('writes no rupee amount of its own', () => {
    // `₹${price}` is the only acceptable shape: a currency mark followed by a
    // value that arrived from somewhere else.
    const literals = code(ASK).match(/₹\s*\d[\d,]*/g) ?? [];
    expect(literals).toEqual([]);
  });

  it('holds no mirror of the allowance either', () => {
    const src = code(ASK);
    // Not the free count, not the pack size, not the price. All three come
    // down the wire together in one object, and all three are read from it.
    expect(src).not.toMatch(/\b(FREE_QUESTIONS|PACK_SIZE|PACK_PRICE)\b/);
    expect(src).toMatch(/useAskQuota/);
    expect(src).toMatch(/quota\.data/);
  });

  it('asks the server for it before the citizen writes anything', () => {
    // A GET, on the same path the question is POSTed to. If this ever goes, the
    // price is being discovered from the response to the question — which is
    // after the money has moved.
    expect(code(API)).toMatch(/askQuota:\s*\(\)\s*=>\s*api\.get<AskQuota>\('\/astrology\/ask'\)/);
  });

  it('says out loud that deleting an answer does not give the question back', () => {
    // The one thing a citizen would otherwise discover by trying it. It is in
    // the confirmation, before the click, not in a receipt afterwards.
    const src = readFileSync(ASK, 'utf8');
    expect(src.replace(/\s+/g, ' ')).toMatch(/does not give the consultation back to your allowance/);
  });
});

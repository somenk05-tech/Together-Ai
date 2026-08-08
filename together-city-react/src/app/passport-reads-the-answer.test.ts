import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sexMark, splitName, tiltOf, hubCode, codeBand } from '@/features/profile/passport';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

/**
 * THE PASSPORT PRINTS WHAT THE CITIZEN ANSWERED.
 *
 * The bug this exists to prevent shipped, and it is worth writing down exactly
 * how, because nothing caught it: the data page read `resolvedGender` — a
 * server-DERIVED display value — and compared it to the lowercase option keys
 * that SexAndGenderCard writes. Nothing ever matched. So a citizen who had
 * answered "Male" on the card eight inches down the same page was stamped X on
 * their own passport, and the two halves of one screen disagreed about them.
 *
 * The typecheck passed (both are strings), every test passed, and the page
 * rendered beautifully. It took a person looking at their own profile.
 */
describe('The passport prints what the citizen answered', () => {
  it('marks M and F from the answer the card actually stores', () => {
    expect(sexMark({ genderIdentity: 'male' })).toBe('M');
    expect(sexMark({ genderIdentity: 'female' })).toBe('F');
    expect(sexMark({ sexAtBirth: 'male' })).toBe('M');
    expect(sexMark({ sexAtBirth: 'female' })).toBe('F');
  });

  /**
   * A passport's sex line is how a document REFERS to you, which is what
   * `genderIdentity` is for. `sexAtBirth` carries a promise — printed on the
   * card itself — that it is used only for health calculations, so it is the
   * fallback and never the winner.
   */
  it('prefers the social answer over the clinical one', () => {
    expect(sexMark({ genderIdentity: 'female', sexAtBirth: 'male' })).toBe('F');
  });

  it('marks X for the answers that are neither', () => {
    for (const a of ['nonBinary', 'other']) expect(sexMark({ genderIdentity: a })).toBe('X');
    expect(sexMark({ sexAtBirth: 'intersex' })).toBe('X');
  });

  /**
   * DECLINING IS AN ANSWER. "Prefer not to say" must not render as X, and must
   * not render as a prompt either — a page that keeps asking a question
   * somebody has already refused has not listened. It gets an inert rule,
   * which is why this returns a third thing rather than null.
   */
  it('tells declining apart from never being asked', () => {
    expect(sexMark({ genderIdentity: 'preferNotToSay' })).toBe('declined');
    expect(sexMark({ sexAtBirth: 'preferNotToSay' })).toBe('declined');
    expect(sexMark({})).toBe(null);
    expect(sexMark(null)).toBe(null);
    expect(sexMark({ genderIdentity: null, sexAtBirth: null })).toBe(null);
  });

  /**
   * AND IT READS THE STORED FIELDS, NOT THE DERIVED ONES. This is the actual
   * guard: `resolvedGender` and `resolvedSex` are the server's summary of the
   * two answers, and reading them here is what broke it. If a future edit
   * reaches for them again, this fails.
   */
  it('never reads a derived value on the data page', () => {
    const src = read('src/features/profile/passport.ts') + read('src/features/profile/pages/Profile.tsx');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    expect(code).not.toMatch(/resolvedGender|resolvedSex/);
  });

  /**
   * ONE WORD IS A GIVEN NAME. Taking the last word as the surname always meant
   * a citizen called "somen" got SURNAME: somen and GIVEN NAMES: — , which is
   * the page telling somebody their name is their family name.
   */
  it('puts a single name in given names, not in the surname line', () => {
    expect(splitName('somen')).toEqual({ surname: null, given: 'somen' });
    expect(splitName('Somen Kumar')).toEqual({ surname: 'Kumar', given: 'Somen' });
    expect(splitName('Ada Byron King')).toEqual({ surname: 'King', given: 'Ada Byron' });
    expect(splitName('   ')).toEqual({ surname: null, given: null });
  });

  /** The code band survives a half-filled document rather than printing
   *  "undefined" across the foot of somebody's passport. */
  it('builds a code band from a name that is missing half of itself', () => {
    const [l1, l2] = codeBand({ surname: null, given: 'somen', handle: 'somen', dob: null, sex: '<', issued: null });
    expect(l1).toHaveLength(44);
    expect(l2).toHaveLength(44);
    expect(l1 + l2).not.toMatch(/undefined|null|NaN/);
    expect(l1.startsWith('P<TC')).toBe(true);
  });

  /**
   * THE STAMP MUST NOT MOVE. A random tilt re-rolls on every render — a page
   * that will not sit still while you read it, and one no screenshot can test.
   */
  it('gives a hub the same stamp angle every time', () => {
    expect(tiltOf('nutrition')).toBe(tiltOf('nutrition'));
    expect(new Set(['a', 'b', 'c', 'd'].map(tiltOf)).size).toBeGreaterThan(1);
    for (const h of ['nutrition', 'dating', 'jobs', 'realestate']) {
      expect(Number(tiltOf(h).replace('deg', ''))).toBeGreaterThanOrEqual(-9);
      expect(Number(tiltOf(h).replace('deg', ''))).toBeLessThanOrEqual(7);
    }
  });

  /** Codes are derived, so a fifteenth hub cannot arrive without one — but
   *  they still have to be distinct, or two visas wear the same mark. */
  it('gives every configured hub a distinct code', () => {
    const keys = [...new Set([...read('src/config/hubs.ts').matchAll(/key:\s*'([a-z]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThanOrEqual(14);
    const codes = keys.map(hubCode);
    const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });
});

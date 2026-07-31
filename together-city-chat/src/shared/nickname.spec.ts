import { NICK_ADJ, NICK_NOUN, nickname } from './nickname';

/**
 * The bug this pins was one character: `>>` where `>>>` was meant.
 *
 * `h` is built with `>>> 0`, so it is an unsigned 32-bit value and routinely
 * exceeds 2^31. `>>` is the SIGNED right shift: JavaScript coerces its operand
 * to int32 first, so any hash with the high bit set became negative, stayed
 * negative through the shift, and `negative % 12` is negative in JS. That indexed
 * NICK_NOUN out of bounds and produced `undefined`.
 *
 * Which is how a citizen sat in a dating chat looking at somebody called
 * "Coastal undefined". Not a data problem, not a missing profile — the anonymous
 * identity generator itself, for roughly half of all user ids, because half of
 * uniform 32-bit values have the high bit set.
 */
const uuid = (i: number): string => {
  // Deterministic pseudo-ids: no randomness in a test, and enough spread to
  // cross the 2^31 boundary in both directions many times over.
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(i * 2654435761)}-${hex(i * 40503)}-4${hex(i * 97).slice(1)}-a${hex(i * 7919).slice(1)}-${hex(i * 104729)}${hex(i * 31)}`;
};

describe('anonymous nicknames', () => {
  it('never produces "undefined" — the bug, across ten thousand ids', () => {
    const broken: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      const n = nickname(uuid(i));
      if (n.includes('undefined')) broken.push(`${uuid(i)} → ${n}`);
    }
    expect(broken.slice(0, 5)).toEqual([]);
    expect(broken).toHaveLength(0);
  });

  it('always picks both halves from the real lists', () => {
    for (let i = 0; i < 2_000; i++) {
      const [adj, noun] = nickname(uuid(i)).split(' ');
      expect(NICK_ADJ).toContain(adj);
      expect(NICK_NOUN).toContain(noun);
    }
  });

  it('is two words, always', () => {
    for (let i = 0; i < 2_000; i++) {
      expect(nickname(uuid(i)).split(' ')).toHaveLength(2);
    }
  });

  it('is stable for one id — the same person keeps the same name', () => {
    // The whole point of a deterministic nickname: somebody chatting
    // anonymously must not be renamed between two page loads.
    const id = uuid(42);
    expect(nickname(id)).toBe(nickname(id));
  });

  it('actually uses the whole noun list, not just the first few', () => {
    // A weaker version of this fix — clamping a negative index to 0 — would pass
    // every test above while giving half the city the same name.
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) seen.add(nickname(uuid(i)).split(' ')[1]);
    expect(seen.size).toBe(NICK_NOUN.length);
  });

  it('handles the empty and single-character cases without throwing', () => {
    expect(nickname('')).toMatch(/^\w+ \w+$/);
    expect(nickname('a')).toMatch(/^\w+ \w+$/);
  });
});

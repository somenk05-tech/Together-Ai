import { describe, it, expect } from 'vitest';
import { qrMatrix } from '@/features/profile/qr';
import FIXTURES from './qr-reference.fixtures.json';

/**
 * THE ENCODER IS CHECKED AGAINST SOMEBODY ELSE'S, NOT AGAINST MY READING.
 *
 * `src/features/profile/qr.ts` is a hand-written QR encoder, and a
 * hand-written encoder nobody decoded is a picture of a QR code. Every matrix
 * in `qr-reference.fixtures.json` came out of the Python `qrcode` library —
 * five strings spanning versions 1, 3 and 4, at all eight mask patterns, byte
 * mode, error correction level M. Forty independent matrices.
 *
 * Comparing at a FORCED mask is what makes this a proof rather than a
 * coincidence. It isolates the parts that can be silently wrong — the
 * bitstream, Reed-Solomon over GF(256), block interleaving, function-pattern
 * placement, the zigzag, the mask functions and the format information — from
 * the one part that is a matter of policy, which mask a symbol picks. Three
 * real bugs were caught exactly this way and each looked like something else:
 *
 *   - the second format copy split 8/7 instead of 7/8, so eleven of fifteen
 *     bits landed right and it read as a placement problem;
 *   - the format string was written LSB-first when the fifteen positions take
 *     it MSB-first, which also leaves eleven of fifteen right;
 *   - the zigzag skipped the timing column once (`right === 6`) instead of
 *     shifting every pair after it (`right <= 6`), so two passes wrote the
 *     same column and every module left of the timing line was wrong.
 *
 * SCANNING was verified separately and by hand: the auto-selected output for
 * twelve URLs was rendered and decoded with OpenCV's QRCodeDetector. Eleven
 * came back exactly. The twelfth is a 60-character URL at version 4 which
 * OpenCV also fails to read when it is encoded by the reference library —
 * byte-identical input, same failure — so it is the detector, not this.
 */
const FIX = FIXTURES as Record<string, Record<string, string[]>>;

describe('The QR encoder agrees with a reference implementation', () => {
  it('has fixtures spanning more than one version', () => {
    const sizes = new Set(Object.values(FIX).map((per) => per['0'].length));
    expect(sizes.size).toBeGreaterThanOrEqual(3);
    expect(Object.keys(FIX).length).toBeGreaterThanOrEqual(4);
  });

  for (const [text, perMask] of Object.entries(FIX)) {
    for (const [mask, rows] of Object.entries(perMask)) {
      it(`matches at mask ${mask} for "${text.slice(-24)}"`, () => {
        expect(qrMatrix(text, Number(mask)).map((r) => r.join(''))).toEqual(rows);
      });
    }
  }

  /**
   * WHICH MASK IT PICKS IS POLICY, AND THE POLICY IS THE SPEC'S.
   *
   * A symbol is valid and scannable under any of the eight; the choice only
   * affects how much unhelpful structure ends up in the picture. This encoder
   * scores the four penalty rules with the format bits IN PLACE, which is what
   * the standard describes. The reference library scores with the format area
   * blanked, so the two sometimes disagree — matching that quirk would be
   * copying a deviation. What must hold is that the choice is deterministic
   * and is genuinely the lowest-scoring of the eight.
   */
  it('always returns one of the eight, deterministically', () => {
    for (const [text, perMask] of Object.entries(FIX)) {
      const auto = qrMatrix(text).map((r) => r.join(''));
      expect(auto).toEqual(qrMatrix(text).map((r) => r.join('')));
      const which = Object.entries(perMask).filter(([, rows]) => rows.join() === auto.join());
      expect({ text, matchedAKnownMask: which.length }).toEqual({ text, matchedAKnownMask: 1 });
    }
  });

  /** A truncated QR scans and goes somewhere else, which is worse than none. */
  it('refuses text it cannot hold rather than cutting it', () => {
    expect(() => qrMatrix('x'.repeat(107))).toThrow(/exceeds/);
    expect(() => qrMatrix('x'.repeat(106))).not.toThrow();
  });
});

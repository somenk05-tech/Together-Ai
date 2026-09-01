import { isSealedCardId, openCardId, sealCardId } from './card-id';

/**
 * ── NOTHING ABOUT THE CARD NAMES THE CITIZEN ────────────────────────────────
 *
 * The sealed card id is the join-breaker between a citizen's city life and
 * their dating profile (fifth audit, H3's open half). Four properties carry
 * the whole design, and each has a test that fails if it drifts:
 * round-trips for its viewer; deterministic (the client's identity for a
 * person); useless to any other viewer; and reveals nothing when tampered
 * with. Wiring into the routes follows once the Matchmaking rename lands.
 */

const SECRET = 'test-access-secret';
const TARGET = '8b7d2f1a-3c4e-4a5b-9c6d-7e8f9a0b1c2d';

describe('nothing about the card names the citizen', () => {
  it('round-trips for the viewer it was sealed for', () => {
    const token = sealCardId(SECRET, 'viewer-1', TARGET);
    expect(isSealedCardId(token)).toBe(true);
    expect(openCardId(SECRET, 'viewer-1', token)).toBe(TARGET);
  });

  it('is deterministic — the client keys caches and dedups on it', () => {
    expect(sealCardId(SECRET, 'viewer-1', TARGET)).toBe(sealCardId(SECRET, 'viewer-1', TARGET));
  });

  it('names nobody: the raw id appears nowhere in the token', () => {
    const token = sealCardId(SECRET, 'viewer-1', TARGET);
    expect(token).not.toContain(TARGET);
    expect(token.toLowerCase()).not.toContain(TARGET.replace(/-/g, '').slice(0, 12));
  });

  it('is a different string for every viewer, and opens for none of the others', () => {
    const mine = sealCardId(SECRET, 'viewer-1', TARGET);
    const theirs = sealCardId(SECRET, 'viewer-2', TARGET);
    expect(mine).not.toBe(theirs);
    expect(openCardId(SECRET, 'viewer-2', mine)).toBeNull();
    expect(openCardId(SECRET, 'viewer-1', theirs)).toBeNull();
  });

  it('refuses a tampered byte, quietly', () => {
    const token = sealCardId(SECRET, 'viewer-1', TARGET);
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    for (const i of [5, Math.floor(token.length / 2), token.length - 1]) {
      expect(openCardId(SECRET, 'viewer-1', flip(token, i))).toBeNull();
    }
  });

  it('refuses garbage and raw ids without throwing', () => {
    for (const junk of ['', 'dv1_', 'dv1_!!!', 'dv1_AAAA', TARGET, 'dv2_whatever']) {
      expect(openCardId(SECRET, 'viewer-1', junk)).toBeNull();
    }
    expect(isSealedCardId(TARGET)).toBe(false);
  });

  it('a different secret opens nothing — and never the sessions’ own secret by accident', () => {
    const token = sealCardId(SECRET, 'viewer-1', TARGET);
    expect(openCardId('rotated-secret', 'viewer-1', token)).toBeNull();
  });
});

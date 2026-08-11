import { describe, it, expect } from 'vitest';
import { PHOTO_SLOTS, REQUIRED_SLOTS, missingPhotos, photosReady, requiredCount }
  from '@/features/beauty/components/PhotoStudio';

/**
 * The beauty assessment used to ask for six photographs before it would say
 * anything at all: face, left, right, hairline, top of head, scalp close-up —
 * every one of them mandatory, and two of them impossible to take of yourself
 * without a second person or a mirror. It asks for three now, and only two of
 * those are required.
 *
 * THE THIRD IS OPTIONAL ON PURPOSE. "A concern" is the thing that is actually
 * bothering somebody, and a person with nothing bothering them has nothing to
 * photograph. Requiring it would mean making them find a picture in order to
 * get past a gate, which is the rigidity this change exists to remove.
 *
 * WHY THIS FILE. The gate is three small pure functions, and the way they go
 * wrong is not a crash — it is `Object.keys(pics).length >= 3`, written by
 * somebody tidying up, which locks out everybody who skipped the optional one
 * and looks completely reasonable in a diff. Every assertion here is about
 * counting the RIGHT photos rather than counting photos.
 */

const shot = { preview: 'data:,', base64: 'x', mediaType: 'image/jpeg' };
const staged = (...slots: string[]) => Object.fromEntries(slots.map((k) => [k, shot]));

describe('the photos the assessment asks for', () => {
  it('is three tiles, and names the two that are required', () => {
    expect(PHOTO_SLOTS.map((s) => s.key)).toEqual(['face', 'skin', 'concern']);
    expect(REQUIRED_SLOTS).toEqual(['face', 'skin']);
  });

  it('puts the required ones first, so filling left to right finishes the job', () => {
    // Not cosmetic: the grid fills in this order when several files are dropped
    // at once, and a person who stops at the last required tile is done.
    const firstOptional = PHOTO_SLOTS.findIndex((s) => !s.required);
    const lastRequired = PHOTO_SLOTS.map((s) => s.required).lastIndexOf(true);
    expect(lastRequired).toBeLessThan(firstOptional);
  });

  it('unlocks on the two required photos, with no concern photo at all', () => {
    expect(photosReady(staged('face', 'skin'))).toBe(true);
    expect(missingPhotos(staged('face', 'skin'))).toEqual([]);
  });

  it('does NOT unlock on two photos that happen to include the optional one', () => {
    // The whole point. A count would pass this; the gate must not.
    expect(photosReady(staged('face', 'concern'))).toBe(false);
    expect(missingPhotos(staged('face', 'concern'))).toEqual(['Skin close-up']);
  });

  it('says what is missing rather than how many, when nothing is staged', () => {
    expect(photosReady({})).toBe(false);
    expect(missingPhotos({})).toEqual(['Face & hair', 'Skin close-up']);
  });

  it('does not score the optional photo, so a finished person reads 2 of 2', () => {
    // requiredCount drives the meter. Counting the optional one would show
    // somebody 2/2 and then 3/2, or 2/3 when they are actually finished.
    expect(requiredCount(staged('face', 'skin'))).toBe(2);
    expect(requiredCount(staged('face', 'skin', 'concern'))).toBe(2);
    expect(requiredCount(staged('concern'))).toBe(0);
  });

  it('every tile carries a label and a hint, because the tile is the only instruction', () => {
    for (const s of PHOTO_SLOTS) {
      expect({ key: s.key, label: s.label.length > 0, hint: s.hint.length > 0 })
        .toEqual({ key: s.key, label: true, hint: true });
    }
  });
});

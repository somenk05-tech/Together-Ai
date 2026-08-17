import { EXERCISE_CATALOG, EXERCISE_MEDIA_ATTRIBUTION, catalogById, exerciseGifUrl, exerciseThumbUrl } from './exercise-catalog';
import { LIBRARY, howTo, mediaFor } from './exercise-library';
import { buildSession, type SessionInput } from './session-engine';

/**
 * AN EXERCISE SAYS HOW IT IS DONE.
 *
 * The Workout runner is a black screen with a name, a countdown and four
 * buttons. For "Bodyweight squat" that is enough; for "Standing hip opener",
 * "Band Pallof press" or "Suitcase carry" it is a stopwatch over a phrase, and
 * the citizen is left to guess at the movement while the clock runs. Guessing
 * at a movement under time pressure is how people hurt themselves.
 *
 * So: every movement this hub can put in front of somebody carries its steps,
 * and the test is the thing that keeps it true — a 47th exercise added without
 * instructions fails here rather than shipping as a silent countdown.
 */

const BASE: SessionInput = {
  minutes: 45, location: 'home', equipment: [], level: 'intermediate', bodyGoal: 'athletic',
  conditions: [], intensityCap: 'vigorous', kcalTarget: 2455, proteinG: 74, nutritionGoal: 'lose',
  weightKg: 78, recent: { sessionsLast7: 0, minutesLast7: 0, daysSinceLast: null },
  limitations: null, missing: [],
};

describe('the catalogue', () => {
  it('carries every movement the dataset described', () => {
    expect(EXERCISE_CATALOG.length).toBe(1324);
  });

  it('gives every one of them instructions', () => {
    // The reason a row is dropped at generation time rather than shipped: a
    // movement with no steps is a name, and a name is what this replaces.
    expect(EXERCISE_CATALOG.filter((e) => e.steps.length === 0)).toEqual([]);
  });

  it('never repeats an id', () => {
    expect(new Set(EXERCISE_CATALOG.map((e) => e.id)).size).toBe(EXERCISE_CATALOG.length);
  });

  it('builds both media urls at the pinned commit, and only where there is media', () => {
    const withMedia = EXERCISE_CATALOG.filter((e) => e.media);
    expect(withMedia.length).toBeGreaterThan(1000);
    const one = withMedia[0];
    expect(exerciseThumbUrl(one)).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/hasaneyldrm\/exercises-dataset@[0-9a-f]{40}\/images\/.+\.jpg$/);
    expect(exerciseGifUrl(one)).toMatch(/\/videos\/.+\.gif$/);
    // A row with no media id gets no url rather than a broken one.
    expect(exerciseThumbUrl({ id: '9999', media: '' })).toBe('');
  });

  it('keeps the attribution the media terms require', () => {
    // Not decoration. The images are © Gym visual and the permission they are
    // used under requires this line wherever they appear; it lives in one
    // constant so it cannot be left off the fourth surface.
    expect(EXERCISE_MEDIA_ATTRIBUTION).toContain('Gym visual');
  });
});

describe('the library', () => {
  it('leaves no movement able only to say its own name', () => {
    const silent = LIBRARY.filter((e) => howTo(e).length === 0).map((e) => e.id);
    expect(silent).toEqual([]);
  });

  it('takes its instructions from one source or the other, never both', () => {
    // Two sets of steps for one movement is two answers to "what do I do", and
    // the day either is corrected they disagree.
    const both = LIBRARY.filter((e) => e.datasetId && e.steps?.length).map((e) => e.id);
    expect(both).toEqual([]);
  });

  it('points every dataset id at a movement that exists', () => {
    const dangling = LIBRARY.filter((e) => e.datasetId && !catalogById(e.datasetId)).map((e) => e.id);
    expect(dangling).toEqual([]);
  });

  it('gives a hand-written movement no borrowed picture', () => {
    // An animation of a barbell good morning over the words "banded good
    // morning" is the same lie the instructions would have been.
    for (const e of LIBRARY.filter((x) => x.steps?.length)) {
      expect(mediaFor(e)).toEqual({ thumb: '', gif: '' });
    }
  });

  it('describes the movements a bodyweight session actually uses', () => {
    // The floor case, and the one most people get: nothing declared, nothing
    // owned. Every step of it has to be followable.
    const s = buildSession(BASE);
    const all = s.blocks.flatMap((b) => b.exercises);
    expect(all.length).toBeGreaterThan(6);
    expect(all.filter((e) => e.steps.length === 0).map((e) => e.name)).toEqual([]);
    expect(all.every((e) => e.muscles.length > 0)).toBe(true);
  });

  it('describes them for a session a condition has rewritten too', () => {
    // A substitution swaps the movement AFTER the block was planned, and the
    // stand-in is the one somebody will actually be doing. Instructions have to
    // follow the swap, not the original.
    const s = buildSession({ ...BASE, conditions: ['jointPain', 'pregnancy'] });
    const all = s.blocks.flatMap((b) => b.exercises);
    expect(all.filter((e) => e.steps.length === 0).map((e) => e.name)).toEqual([]);
  });
});

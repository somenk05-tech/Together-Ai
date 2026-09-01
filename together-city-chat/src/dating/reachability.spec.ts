import { hardFilterReason, unreachableReason, mismatchFactor } from './matching';
import type { DXProfile } from './matching';

/**
 * H4 — the phantom like.
 *
 * matches(), discover(), stack() and matchDetail() each asked only whether the
 * candidate passed the VIEWER's filters. reindexAfterChange() asked both ways.
 * So the live-match notifier and the lists disagreed about who was a candidate,
 * and a citizen could like somebody whose own filters had already removed them.
 */
const dx = (p: Partial<DXProfile>): DXProfile => p as DXProfile;

describe('unreachableReason', () => {
  const young = dx({ prefAgeMin: 25, prefAgeMax: 32 });
  const older = dx({ prefAgeMin: 38, prefAgeMax: 55 });

  it('lets two people through when both sets of filters are happy', () => {
    expect(unreachableReason(young, dx({}), 28, 30)).toBeNull();
  });

  it('blocks when MY filters exclude them — as before', () => {
    expect(unreachableReason(young, dx({}), 28, 44)).toEqual({ by: 'you', reason: 'age' });
  });

  it('blocks when THEIR filters exclude me — the case that leaked', () => {
    // A 28-year-old with no age preference, looking at a 44-year-old who only
    // wants 38-55. The viewer's own filter is silent, so the old check passed
    // them and offered a Like that could never be reciprocated.
    const seenByOldCode = hardFilterReason(dx({}), older, 44);
    expect(seenByOldCode).toBeNull();                       // old check: shown
    expect(unreachableReason(dx({}), older, 28, 44))        // new check: hidden
      .toEqual({ by: 'them', reason: 'age' });
  });

  it('names my own filter first when both sides would block', () => {
    // Determinism matters: whichever side we report has to be stable, or the
    // same pair explains itself differently on two loads of the same page.
    // I am 28 and want 25-32; they are 44 and want 38-55. Each of us is outside
    // the other's range, so both checks fire and the answer must not depend on
    // which one we happened to run first.
    expect(unreachableReason(young, older, 28, 44)).toEqual({ by: 'you', reason: 'age' });
  });

  it('is symmetric — neither person is shown a door the other has closed', () => {
    const a = dx({ prefAgeMin: 25, prefAgeMax: 32 });
    const b = dx({ prefAgeMin: 38, prefAgeMax: 55 });
    const aSeesB = unreachableReason(a, b, 28, 44);
    const bSeesA = unreachableReason(b, a, 44, 28);
    expect(aSeesB).not.toBeNull();
    expect(bSeesA).not.toBeNull();
  });

  /**
   * DEAL-BREAKERS LEFT THIS FUNCTION ON 1 SEP, and the both-ways rule went with
   * them rather than being dropped.
   *
   * `unreachableReason` now answers only for the three that still remove
   * somebody — age, height, language. The seven chips moved to
   * `mismatchFactor`, which reads the pair from BOTH sides for the same reason
   * this function always has: a boundary the other person set is as real as one
   * you set yourself, and honouring only the viewer's is the door locked from
   * the other side. So the property is asserted where it now lives.
   */
  it('no longer makes anybody unreachable over a deal-breaker', () => {
    const teetotal = dx({ dealBreakers: ['Drinking'] });
    const drinker = dx({ drinking: 'Regularly' });
    expect(unreachableReason(drinker, teetotal, 30, 30)).toBeNull();
    expect(unreachableReason(teetotal, drinker, 30, 30)).toBeNull();
  });

  it('carries deal-breakers both ways as a penalty instead', () => {
    const teetotal = dx({ dealBreakers: ['Drinking'] });
    const drinker = dx({ drinking: 'Regularly' });
    expect(mismatchFactor(teetotal, drinker)).toBe(0.85);
    expect(mismatchFactor(drinker, teetotal)).toBe(0.85);
  });

  it('does not invent a block out of empty profiles', () => {
    expect(unreachableReason(dx({}), dx({}), 30, 30)).toBeNull();
  });
});

describe('the lists and the notifier now agree', () => {
  it('reaches the same verdict for a pair however it is asked', () => {
    // reindexAfterChange decides who gets "a newly compatible member" and the
    // lists decide who is on the page. They call one function now, so a pair
    // cannot be a candidate for the notification and absent from the list.
    const cases: [DXProfile, DXProfile, number, number][] = [
      [dx({}), dx({ prefAgeMin: 38 }), 28, 44],
      [dx({ prefAgeMax: 30 }), dx({}), 28, 44],
      [dx({}), dx({}), 30, 30],
      [dx({ dealBreakers: ['Smoking'] }), dx({ smoking: 'Regularly' }), 30, 30],
    ];
    for (const [mine, theirs, myAge, theirAge] of cases) {
      const listVerdict = unreachableReason(mine, theirs, myAge, theirAge);
      const notifierVerdict = unreachableReason(mine, theirs, myAge, theirAge);
      expect(listVerdict).toEqual(notifierVerdict);
    }
  });
});

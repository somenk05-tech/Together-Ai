import { hardFilterReason, heightFilterReason, unreachableReason, type DXProfile } from './matching';

/**
 * The height preference is a range, and the range hides people.
 *
 * L2 recorded `prefHeight` as "unparseable free text": a box on the dating form
 * that took "165–185cm" or "tallish" or nothing, and that no reader anywhere
 * could act on. It was one of the six preferences H3 found being collected and
 * never used — a question asked to make the form look thorough.
 *
 * Owner decision, 1 Aug: it becomes a min/max range in centimetres, and it is a
 * HARD filter alongside the age range rather than a scoring nudge. Somebody
 * outside your range does not appear.
 *
 * THAT IS A SHARP TOOL, so most of this spec is about the cases where it must
 * NOT cut. A hard filter that fires on absent or nonsense data does not show an
 * error — it silently removes strangers, tells neither person why, and the only
 * symptom is a thinner pool that looks like the city being quiet.
 */

const tall: DXProfile = { heightCm: 190 };
const mid: DXProfile = { heightCm: 172 };
const short: DXProfile = { heightCm: 152 };
const unmeasured: DXProfile = {};

describe('a stated range', () => {
  const wants165to185: DXProfile = { prefHeightMinCm: 165, prefHeightMaxCm: 185 };

  it('hides somebody below it', () => {
    expect(heightFilterReason(wants165to185, short)).toBe('height');
  });

  it('hides somebody above it', () => {
    expect(heightFilterReason(wants165to185, tall)).toBe('height');
  });

  it('lets somebody inside it through', () => {
    expect(heightFilterReason(wants165to185, mid)).toBeNull();
  });

  it('is inclusive at both ends — 165 is not "under 165"', () => {
    expect(heightFilterReason(wants165to185, { heightCm: 165 })).toBeNull();
    expect(heightFilterReason(wants165to185, { heightCm: 185 })).toBeNull();
  });

  it('works with only one end set', () => {
    expect(heightFilterReason({ prefHeightMinCm: 170 }, short)).toBe('height');
    expect(heightFilterReason({ prefHeightMinCm: 170 }, tall)).toBeNull();
    expect(heightFilterReason({ prefHeightMaxCm: 170 }, tall)).toBe('height');
    expect(heightFilterReason({ prefHeightMaxCm: 170 }, short)).toBeNull();
  });
});

describe('the cases where it must not cut', () => {
  it('never hides somebody whose height is not recorded', () => {
    // The whole reason this is safe to ship as a hard filter. `undefined` is
    // not "too short", and a preference must not be applied to a fact nobody
    // collected — the same rule prefDistanceKm follows for an unmeasured
    // distance.
    expect(heightFilterReason({ prefHeightMinCm: 165, prefHeightMaxCm: 185 }, unmeasured)).toBeNull();
    expect(heightFilterReason({ prefHeightMinCm: 165 }, { heightCm: null })).toBeNull();
  });

  it('ignores a range that excludes everybody rather than emptying the pool', () => {
    expect(heightFilterReason({ prefHeightMinCm: 185, prefHeightMaxCm: 165 }, mid)).toBeNull();
    expect(heightFilterReason({ prefHeightMinCm: 185, prefHeightMaxCm: 165 }, tall)).toBeNull();
  });

  it('treats figures outside human range as nothing stated', () => {
    for (const nonsense of [0, -170, 12, 900, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(heightFilterReason({ prefHeightMinCm: nonsense }, mid)).toBeNull();
      expect(heightFilterReason({ prefHeightMaxCm: nonsense }, mid)).toBeNull();
    }
    // And a candidate whose stored height is nonsense is not hidden by it.
    expect(heightFilterReason({ prefHeightMinCm: 165 }, { heightCm: 3 })).toBeNull();
  });

  it('does not read the old free-text box', () => {
    // L2's box, still sitting in older profiles. Parsing it here would mean a
    // guess about what somebody typed decides whether a stranger is visible.
    const legacy = { prefHeight: '180-200cm' } as DXProfile & { prefHeight: string };
    expect(heightFilterReason(legacy, short)).toBeNull();
    expect(heightFilterReason(legacy, mid)).toBeNull();
  });

  it('does nothing when nobody set a range', () => {
    expect(heightFilterReason({}, mid)).toBeNull();
    expect(heightFilterReason({}, unmeasured)).toBeNull();
  });
});

describe('it is actually wired in, in both directions', () => {
  it('reaches hardFilterReason — not just an exported helper nobody calls', () => {
    // The failure this pins is the one 9e0082d shipped: a decision module that
    // works perfectly and is never consulted.
    expect(hardFilterReason({ prefHeightMinCm: 165, prefHeightMaxCm: 185 }, short, 30)).toBe('height');
    expect(hardFilterReason({ prefHeightMinCm: 165, prefHeightMaxCm: 185 }, mid, 30)).toBeNull();
  });

  it('still lets the age filter answer first when both would fire', () => {
    // Not a behaviour anybody depends on, but the reason should be the one the
    // caller would explain, and age is the older, better-understood filter.
    expect(hardFilterReason({ prefAgeMax: 25, prefHeightMinCm: 165 }, short, 40)).toBe('age');
  });

  it('closes the door from THEIR side too', () => {
    // unreachableReason composes hardFilterReason both ways, so a range set by
    // the candidate removes me from their pool AND me from theirs — the H4
    // lesson: a filter honoured one way is honoured neither way.
    const me: DXProfile = { heightCm: 152 };
    const them: DXProfile = { heightCm: 172, prefHeightMinCm: 165 };
    expect(unreachableReason(me, them, 30, 30)).toEqual({ by: 'them', reason: 'height' });
  });

  it('lets a pair through when neither range excludes the other', () => {
    const me: DXProfile = { heightCm: 172, prefHeightMinCm: 160, prefHeightMaxCm: 200 };
    const them: DXProfile = { heightCm: 181, prefHeightMinCm: 165, prefHeightMaxCm: 180 };
    // They are 181 and I asked for 160–200: fine. I am 172 and they asked for
    // 165–180: also fine.
    expect(unreachableReason(me, them, 30, 30)).toBeNull();
  });

  it('does not invent a block between two profiles that stated nothing', () => {
    expect(unreachableReason({}, {}, 30, 30)).toBeNull();
  });
});
